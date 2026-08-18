-- ============================================================================
--  Личное инфо — база учебных конспектов
--  Структура: Глава → Тема → Ветка → Карточка → Блоки
--  Выполнить целиком в Supabase → SQL Editor → New query → Run
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ─── Кто имеет право редактировать ──────────────────────────────────────────
create table if not exists editors (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

-- security definer: обходит RLS, поэтому политики могут спокойно её звать
create or replace function is_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from editors where user_id = auth.uid());
$$;

-- ─── Дерево: глава → тема → ветка → карточка ───────────────────────────────
--  Родитель хранится ссылкой, поэтому глубина технически не ограничена:
--  если однажды понадобится пятый уровень, менять схему не придётся.
create table if not exists nodes (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references nodes (id) on delete cascade,
  title      text not null,
  subtitle   text,
  kind       text not null default 'branch'
             check (kind in ('chapter', 'topic', 'branch', 'card')),
  icon       text,
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('russian'::regconfig, coalesce(title, '')),    'A') ||
    setweight(to_tsvector('russian'::regconfig, coalesce(subtitle, '')), 'B')
  ) stored
);

create index if not exists nodes_parent_idx on nodes (parent_id, position);
create index if not exists nodes_search_idx on nodes using gin (search_vector);
create index if not exists nodes_title_trgm on nodes using gin (title gin_trgm_ops);

-- ─── Блоки: содержимое карточки ────────────────────────────────────────────
--  Каждый блок — это один термин со своей цветной меткой и своим текстом.
--  Дополнять «именно ТПО» = править ровно один блок, не трогая остальные.
create table if not exists blocks (
  id         uuid primary key default gen_random_uuid(),
  node_id    uuid not null references nodes (id) on delete cascade,
  label      text not null default '',
  color      text not null default 'gold' check (color in ('red', 'green', 'gold')),
  content      jsonb,
  content_text text,
  position   int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    setweight(to_tsvector('russian'::regconfig, coalesce(label, '')),        'A') ||
    setweight(to_tsvector('russian'::regconfig, coalesce(content_text, '')), 'C')
  ) stored
);

create index if not exists blocks_node_idx   on blocks (node_id, position);
create index if not exists blocks_search_idx on blocks using gin (search_vector);
create index if not exists blocks_label_trgm on blocks using gin (label gin_trgm_ops);

-- ─── История правок блоков ─────────────────────────────────────────────────
create table if not exists block_revisions (
  id           bigserial primary key,
  block_id     uuid not null references blocks (id) on delete cascade,
  label        text,
  color        text,
  content      jsonb,
  content_text text,
  author       uuid,
  created_at   timestamptz not null default now()
);

create index if not exists block_revisions_idx on block_revisions (block_id, created_at desc);

create or replace function blocks_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if old.content is distinct from new.content
     or old.label is distinct from new.label
     or old.color is distinct from new.color then
    insert into block_revisions (block_id, label, color, content, content_text, author)
    values (old.id, old.label, old.color, old.content, old.content_text, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists blocks_before_update_trg on blocks;
create trigger blocks_before_update_trg
  before update on blocks
  for each row execute function blocks_before_update();

create or replace function touch_node()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists nodes_touch_trg on nodes;
create trigger nodes_touch_trg
  before update on nodes
  for each row execute function touch_node();

-- Правка блока поднимает дату обновления карточки — «недавно дополнено» работает
create or replace function bump_node_from_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update nodes set updated_at = now()
   where id = coalesce(new.node_id, old.node_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists blocks_bump_node_trg on blocks;
create trigger blocks_bump_node_trg
  after insert or update or delete on blocks
  for each row execute function bump_node_from_block();

-- ─── Утилита: обычный текст → документ редактора ───────────────────────────
--  Пригодится и для массового импорта старых конспектов: каждая непустая
--  строка становится абзацем.
create or replace function text_to_doc(p_text text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'type', 'doc',
    'content', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'type', 'paragraph',
                 'content', jsonb_build_array(
                   jsonb_build_object('type', 'text', 'text', line)
                 )
               ) order by ord)
        from unnest(string_to_array(coalesce(p_text, ''), E'\n')) with ordinality as t(line, ord)
       where btrim(line) <> ''
    ), '[]'::jsonb)
  );
$$;

-- ─── Хлебные крошки: полный путь узла одной строкой ────────────────────────
create or replace function node_path(p_id uuid)
returns text
language sql
stable
as $$
  with recursive up as (
    select id, parent_id, title, 0 as depth
      from nodes where id = p_id
    union all
    select n.id, n.parent_id, n.title, up.depth + 1
      from nodes n join up on n.id = up.parent_id
  )
  select string_agg(title, ' / ' order by depth desc) from up;
$$;

-- ─── Поиск: по названиям узлов и по тексту блоков ──────────────────────────
--  Всегда возвращает id карточки/раздела, который нужно открыть.
create or replace function search_all(q text, lim int default 40)
returns table (
  id      uuid,
  title   text,
  kind    text,
  path    text,
  label   text,
  snippet text,
  rank    real
)
language sql
stable
as $$
  with query as (select websearch_to_tsquery('russian'::regconfig, q) as tsq),
  hits as (
    select
      n.id,
      n.title,
      n.kind,
      null::text as label,
      coalesce(n.subtitle, '') as body,
      greatest(
        ts_rank(n.search_vector, (select tsq from query)),
        case when n.title ilike '%' || q || '%' then 0.5 else 0 end
      )::real as rank
    from nodes n
    where n.search_vector @@ (select tsq from query)
       or n.title ilike '%' || q || '%'

    union all

    select
      b.node_id as id,
      n.title,
      n.kind,
      nullif(b.label, '') as label,
      coalesce(b.content_text, '') as body,
      greatest(
        ts_rank(b.search_vector, (select tsq from query)),
        case when b.label ilike '%' || q || '%' then 0.45 else 0 end
      )::real as rank
    from blocks b
    join nodes n on n.id = b.node_id
    where b.search_vector @@ (select tsq from query)
       or b.label ilike '%' || q || '%'
  ),
  best as (
    select distinct on (hits.id, coalesce(hits.label, ''))
           hits.id, hits.title, hits.kind, hits.label, hits.body, hits.rank
      from hits
     order by hits.id, coalesce(hits.label, ''), hits.rank desc
  )
  select
    best.id,
    best.title,
    best.kind,
    node_path(best.id) as path,
    best.label,
    ts_headline(
      'russian'::regconfig,
      best.body,
      (select tsq from query),
      'StartSel=[[,StopSel=]],MaxWords=28,MinWords=8,MaxFragments=2,FragmentDelimiter= … '
    ) as snippet,
    best.rank
  from best
  order by best.rank desc, best.title
  limit lim;
$$;

-- ─── Карточки без единого блока: «что ещё не написано» ─────────────────────
create or replace function empty_cards()
returns table (id uuid, title text)
language sql
stable
as $$
  select n.id, n.title
    from nodes n
   where n.kind = 'card'
     and not exists (select 1 from blocks b where b.node_id = n.id)
   order by n.created_at desc
   limit 100;
$$;

-- ─── Оформление: фон приложения (одна строка на всё приложение) ────────────
create table if not exists app_settings (
  id         int primary key default 1 check (id = 1),
  background jsonb not null default '{"kind":"preset","preset":"peonies","intensity":0.6,"blur":0}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into app_settings (id) values (1) on conflict (id) do nothing;

-- ─── RLS: читают все, пишет только редактор ────────────────────────────────
alter table nodes           enable row level security;
alter table blocks          enable row level security;
alter table block_revisions enable row level security;
alter table editors         enable row level security;
alter table app_settings    enable row level security;

drop policy if exists nodes_read  on nodes;
drop policy if exists nodes_write on nodes;
create policy nodes_read  on nodes for select using (true);
create policy nodes_write on nodes for all
  using (is_editor()) with check (is_editor());

drop policy if exists blocks_read  on blocks;
drop policy if exists blocks_write on blocks;
create policy blocks_read  on blocks for select using (true);
create policy blocks_write on blocks for all
  using (is_editor()) with check (is_editor());

drop policy if exists revisions_read  on block_revisions;
drop policy if exists revisions_write on block_revisions;
create policy revisions_read  on block_revisions for select using (is_editor());
create policy revisions_write on block_revisions for all
  using (is_editor()) with check (is_editor());

drop policy if exists editors_self on editors;
create policy editors_self on editors for select using (user_id = auth.uid());

drop policy if exists settings_read  on app_settings;
drop policy if exists settings_write on app_settings;
create policy settings_read  on app_settings for select using (true);
create policy settings_write on app_settings for update
  using (is_editor()) with check (is_editor());

-- ─── Хранилище картинок ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('notes', 'notes', true)
on conflict (id) do nothing;

drop policy if exists notes_public_read  on storage.objects;
drop policy if exists notes_editor_write on storage.objects;
create policy notes_public_read on storage.objects for select
  using (bucket_id = 'notes');
create policy notes_editor_write on storage.objects for all
  using (bucket_id = 'notes' and is_editor())
  with check (bucket_id = 'notes' and is_editor());
