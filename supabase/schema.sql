-- ============================================================================
--  Личное инфо — база учебных конспектов
--  Структура: Глава → Тема → Ветка → Карточка → Блоки
--  Выполнить целиком в Supabase → SQL Editor → New query → Run
--  Скрипт идемпотентный: его можно запускать повторно, он же обновляет базу,
--  развёрнутую по прежней версии схемы.
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
--  Добавляя новый цвет, не забудьте: у существующей базы check-ограничение
--  надо пересоздать вручную (alter table blocks drop constraint blocks_color_check; …).
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
--  Намеренно без внешнего ключа на blocks: удаление блока или целой карточки
--  не должно уносить историю. Наоборот — последняя версия записывается сюда
--  перед удалением (op = 'delete'), вместе с путём до карточки, чтобы её можно
--  было найти и вернуть руками.
create table if not exists block_revisions (
  id           bigserial primary key,
  block_id     uuid not null,
  node_id      uuid,
  path         text,
  op           text not null default 'update',
  label        text,
  color        text,
  content      jsonb,
  content_text text,
  author       uuid,
  created_at   timestamptz not null default now()
);

-- Базы, развёрнутые по прежней схеме: снимаем каскад и добавляем новые колонки
alter table block_revisions drop constraint if exists block_revisions_block_id_fkey;
alter table block_revisions add column if not exists node_id uuid;
alter table block_revisions add column if not exists path text;
alter table block_revisions add column if not exists op text not null default 'update';

create index if not exists block_revisions_idx      on block_revisions (block_id, created_at desc);
create index if not exists block_revisions_node_idx on block_revisions (node_id, created_at desc);

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

-- ─── Триггеры блоков ───────────────────────────────────────────────────────

-- Правка: прошлая версия уходит в историю, если менялся текст, метка или цвет
create or replace function blocks_before_update()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if old.content is distinct from new.content
     or old.label is distinct from new.label
     or old.color is distinct from new.color then
    insert into block_revisions (block_id, node_id, path, op, label, color, content, content_text, author)
    values (old.id, old.node_id, node_path(old.node_id), 'update',
            old.label, old.color, old.content, old.content_text, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists blocks_before_update_trg on blocks;
create trigger blocks_before_update_trg
  before update on blocks
  for each row execute function blocks_before_update();

-- Удаление блока: последняя версия — в историю.
-- now() одинаково в пределах транзакции, поэтому по created_at = now() видно,
-- что запись уже сделал триггер раздела (см. nodes_before_delete).
create or replace function blocks_before_delete()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from block_revisions r
     where r.block_id = old.id and r.op = 'delete' and r.created_at = now()
  ) then
    insert into block_revisions (block_id, node_id, path, op, label, color, content, content_text, author)
    values (old.id, old.node_id, node_path(old.node_id), 'delete',
            old.label, old.color, old.content, old.content_text, auth.uid());
  end if;
  return old;
end;
$$;

drop trigger if exists blocks_before_delete_trg on blocks;
create trigger blocks_before_delete_trg
  before delete on blocks
  for each row execute function blocks_before_delete();

-- Удаление раздела: пока дерево ещё целое, записываем в историю блоки всех
-- вложенных карточек — с полными путями. Каскад потом пройдёт по ним сам,
-- но повторно записывать уже не станет.
create or replace function nodes_before_delete()
returns trigger
language plpgsql
as $$
begin
  insert into block_revisions (block_id, node_id, path, op, label, color, content, content_text, author)
  with recursive sub as (
    select id from nodes where id = old.id
    union all
    select n.id from nodes n join sub on n.parent_id = sub.id
  )
  select b.id, b.node_id, node_path(b.node_id), 'delete',
         b.label, b.color, b.content, b.content_text, auth.uid()
    from blocks b
    join sub on sub.id = b.node_id
   where not exists (
     select 1 from block_revisions r
      where r.block_id = b.id and r.op = 'delete' and r.created_at = now()
   );
  return old;
end;
$$;

drop trigger if exists nodes_before_delete_trg on nodes;
create trigger nodes_before_delete_trg
  before delete on nodes
  for each row execute function nodes_before_delete();

-- ─── Триггеры узлов ────────────────────────────────────────────────────────

-- «Недавно дополнено» считает по updated_at, поэтому перестановка стрелками
-- (меняется только position) и переезд в другой раздел дату не трогают.
create or replace function touch_node()
returns trigger
language plpgsql
as $$
begin
  if old.title is distinct from new.title
     or old.subtitle is distinct from new.subtitle
     or old.kind is distinct from new.kind
     or old.icon is distinct from new.icon then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists nodes_touch_trg on nodes;
create trigger nodes_touch_trg
  before update on nodes
  for each row execute function touch_node();

-- Правка блока поднимает дату обновления карточки — «недавно дополнено» работает.
-- Перестановка блоков (меняется только position) карточку не поднимает.
create or replace function bump_node_from_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.content is not distinct from new.content
       and old.label is not distinct from new.label
       and old.color is not distinct from new.color then
      return new;
    end if;
  end if;
  update nodes set updated_at = now()
   where id = coalesce(new.node_id, old.node_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists blocks_bump_node_trg on blocks;
create trigger blocks_bump_node_trg
  after insert or update or delete on blocks
  for each row execute function bump_node_from_block();

-- Раздел нельзя положить внутрь самого себя или своего потомка
create or replace function nodes_check_cycle()
returns trigger
language plpgsql
as $$
declare
  cur uuid := new.parent_id;
begin
  while cur is not null loop
    if cur = new.id then
      raise exception 'Раздел нельзя переместить внутрь самого себя';
    end if;
    select parent_id into cur from nodes where id = cur;
  end loop;
  return new;
end;
$$;

drop trigger if exists nodes_check_cycle_trg on nodes;
create trigger nodes_check_cycle_trg
  before insert or update of parent_id on nodes
  for each row execute function nodes_check_cycle();

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

-- ─── Поиск: по названиям узлов и по тексту блоков ──────────────────────────
--  Всегда возвращает id карточки/раздела, который нужно открыть, а для
--  совпадений в блоке — метку и её цвет.
--  Возвращаемый набор колонок менялся, поэтому функция пересоздаётся.
drop function if exists search_all(text, int);
create function search_all(q text, lim int default 40)
returns table (
  id      uuid,
  title   text,
  kind    text,
  path    text,
  label   text,
  color   text,
  snippet text,
  rank    real
)
language sql
stable
as $$
  with query as (
    select websearch_to_tsquery('russian'::regconfig, q) as tsq,
           -- подстрока для ILIKE: служебные % и _ из запроса экранируем
           '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  ),
  hits as (
    select
      n.id,
      n.title,
      n.kind,
      null::text as label,
      null::text as color,
      coalesce(n.subtitle, '') as body,
      greatest(
        ts_rank(n.search_vector, (select tsq from query)),
        case when n.title ilike (select pat from query) then 0.5 else 0 end
      )::real as rank
    from nodes n
    where n.search_vector @@ (select tsq from query)
       or n.title ilike (select pat from query)

    union all

    select
      b.node_id as id,
      n.title,
      n.kind,
      nullif(b.label, '') as label,
      b.color,
      coalesce(b.content_text, '') as body,
      greatest(
        ts_rank(b.search_vector, (select tsq from query)),
        case when b.label ilike (select pat from query) then 0.45 else 0 end
      )::real as rank
    from blocks b
    join nodes n on n.id = b.node_id
    where b.search_vector @@ (select tsq from query)
       or b.label ilike (select pat from query)
  ),
  best as (
    select distinct on (hits.id, coalesce(hits.label, ''))
           hits.id, hits.title, hits.kind, hits.label, hits.color, hits.body, hits.rank
      from hits
     order by hits.id, coalesce(hits.label, ''), hits.rank desc
  )
  select
    best.id,
    best.title,
    best.kind,
    node_path(best.id) as path,
    best.label,
    best.color,
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
--  Только изображения и не больше 12 МБ — приложение и так сжимает фото перед
--  отправкой, это страховка на уровне хранилища.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notes', 'notes', true, 12582912, array['image/*'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists notes_public_read  on storage.objects;
drop policy if exists notes_editor_write on storage.objects;
create policy notes_public_read on storage.objects for select
  using (bucket_id = 'notes');
create policy notes_editor_write on storage.objects for all
  using (bucket_id = 'notes' and is_editor())
  with check (bucket_id = 'notes' and is_editor());
