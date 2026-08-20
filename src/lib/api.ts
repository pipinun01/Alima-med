import { supabase, STORAGE_BUCKET } from './supabase'
import { invalidateData } from './sw-client'
import { shrinkImage } from './image'
import type { Block, DbNode, NodeKind, SearchHit, TermColor } from './types'

/* ══════════════════════════════════════════════════════════════════════════
   Чтение: PostgREST отдаёт не больше 1000 строк за запрос
   ══════════════════════════════════════════════════════════════════════════ */

const PAGE = 1000

interface Result<T> {
  data: T | null
  error: ApiError | null
}

/** Забираем таблицу страницами, пока они не кончатся — иначе дерево молча обрежется */
async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<Result<T[]>>) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw new Error(describeError(error))
    const chunk = data ?? []
    rows.push(...chunk)
    if (chunk.length < PAGE) return rows
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Запись: живая сессия, повтор после обрыва связи, понятная ошибка
   ══════════════════════════════════════════════════════════════════════════ */

interface ApiError {
  message?: string
  code?: string
  status?: number
  statusCode?: number | string
  name?: string
}

const AUTH_RE = /jwt|token|expired|not authenticated|row-level security|permission denied|unauthorized|forbidden/i
const NETWORK_RE = /failed to fetch|load failed|network|fetch failed|time(d)? ?out|abort|socket|gateway|cloudflare|econn/i
/** Паузы между попытками: сеть на телефоне часто «моргает» на секунду-другую */
const RETRY_AFTER = [700, 1800, 3500]

const statusOf = (e: ApiError) => Number(e.status ?? e.statusCode ?? 0)

/** Токен истёк, сессия потерялась или RLS не пустила — лечится обновлением сессии */
function isAuthProblem(e: ApiError) {
  const status = statusOf(e)
  if (status === 401 || status === 403) return true
  if (e.code === 'PGRST301' || e.code === '42501' || e.code === 'PGRST116') return true
  return AUTH_RE.test(e.message ?? '')
}

/** Сбой сети или сервера — имеет смысл просто повторить */
function isTransient(e: ApiError) {
  const status = statusOf(e)
  if (status === 0 || status === 408 || status === 425 || status === 429 || status >= 500) return true
  if (e.name === 'TypeError' || e.name === 'AbortError' || e.name === 'AuthRetryableFetchError') return true
  return NETWORK_RE.test(e.message ?? '')
}

/** Человеческое объяснение для строки ошибки под кнопкой «Сохранить» */
export function describeError(e: unknown): string {
  const err = (e ?? {}) as ApiError
  const raw = (err.message ?? '').trim()
  const detail = raw ? ` (${raw.slice(0, 140)})` : ''
  if (err.code === 'PGRST116') return `Запись не найдена — возможно, её уже удалили, или нет прав редактора${detail}`
  if (isAuthProblem(err)) return `Сессия устарела или нет прав редактора — выйдите и войдите заново${detail}`
  if (isTransient(err)) return `Нет связи с сервером — проверьте интернет и попробуйте ещё раз${detail}`
  return raw || 'Неизвестная ошибка'
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Сессия Supabase живёт час. Пока пишется длинный конспект или приложение
 * спит в фоне, токен успевает истечь, и первая попытка записи падает.
 * Поэтому перед записью проверяем срок и при необходимости обновляем заранее.
 */
async function ensureSession() {
  try {
    const { data } = await supabase.auth.getSession()
    const session = data.session
    if (!session) return
    const msLeft = (session.expires_at ?? 0) * 1000 - Date.now()
    if (msLeft < 120_000) await supabase.auth.refreshSession()
  } catch {
    /* сам запрос ниже скажет точнее, что не так */
  }
}

/**
 * Выполняет запись с повторами. `run` получает номер попытки: первая — 0.
 * Ошибка сессии → обновляем сессию и пробуем снова; обрыв сети → ждём и пробуем снова.
 * Бросает Error с уже готовым текстом для интерфейса.
 */
async function write<T>(run: (attempt: number) => PromiseLike<Result<T>>): Promise<T> {
  let last: ApiError = {}
  for (let attempt = 0; attempt <= RETRY_AFTER.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_AFTER[attempt - 1])
    await ensureSession()

    let result: Result<T>
    try {
      result = await run(attempt)
    } catch (e) {
      result = { data: null, error: e as ApiError }
    }
    if (!result.error) return result.data as T
    last = result.error

    // Совсем без сети повторять бессмысленно — лучше сразу сказать
    if (typeof navigator !== 'undefined' && navigator.onLine === false) break
    if (isAuthProblem(last)) {
      await supabase.auth.refreshSession().catch(() => {})
      continue
    }
    if (isTransient(last)) continue
    break
  }
  throw new Error(describeError(last))
}

/** Свой id для новой строки: повтор после обрыва связи не создаст дубликат */
const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : null

/* ══════════════════════════════════════════════════════════════════════════
   Дерево
   ══════════════════════════════════════════════════════════════════════════ */

const NODE_COLUMNS =
  'id, parent_id, title, subtitle, kind, icon, position, created_at, updated_at'

/** Всё дерево — навигация дальше идёт без походов на сервер */
export async function fetchTree() {
  return fetchAllPages<DbNode>((from, to) =>
    supabase
      .from('nodes')
      .select(NODE_COLUMNS)
      .order('position', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )
}

export interface NewNode {
  parent_id: string | null
  title: string
  subtitle?: string | null
  kind: NodeKind
  icon?: string | null
  position: number
}

export async function createNode(node: NewNode) {
  const id = newId()
  const created = await write<DbNode>(() =>
    id
      ? supabase.from('nodes').upsert({ id, ...node }, { onConflict: 'id' }).select(NODE_COLUMNS).single()
      : supabase.from('nodes').insert(node).select(NODE_COLUMNS).single(),
  )
  invalidateData('/rest/v1/nodes')
  return created
}

export async function updateNode(id: string, patch: Partial<DbNode>) {
  const updated = await write<DbNode>(() =>
    supabase.from('nodes').update(patch).eq('id', id).select(NODE_COLUMNS).single(),
  )
  invalidateData('/rest/v1/nodes')
  return updated
}

/** Удаление каскадное: потомки уходят вместе с родителем (ON DELETE CASCADE) */
export async function deleteNode(id: string) {
  await write<unknown>(async (attempt) => {
    const { data, error } = await supabase.from('nodes').delete().eq('id', id).select('id')
    if (error) return { data: null, error }
    // Ноль строк на первой попытке — запись не наша или сессия потерялась.
    // На повторе — скорее всего, первая попытка всё же дошла.
    if (!data?.length && attempt === 0) return { data: null, error: { code: 'PGRST116', message: 'Не удалось удалить' } }
    return { data: data ?? [], error: null }
  })
  invalidateData('/rest/v1/nodes')
}

export async function reorderNodes(items: { id: string; position: number }[]) {
  if (!items.length) return
  await Promise.all(
    items.map((i) =>
      write(() => supabase.from('nodes').update({ position: i.position }).eq('id', i.id).select('id').single()),
    ),
  )
  invalidateData('/rest/v1/nodes')
}

/* ══════════════════════════════════════════════════════════════════════════
   Блоки карточки
   ══════════════════════════════════════════════════════════════════════════ */

export async function fetchBlocks(nodeId: string) {
  const { data, error } = await supabase
    .from('blocks')
    .select('*')
    .eq('node_id', nodeId)
    .order('position', { ascending: true })
  if (error) throw new Error(describeError(error))
  return (data ?? []) as Block[]
}

export async function createBlock(block: {
  node_id: string
  label: string
  color: TermColor
  position: number
  content?: unknown
  content_text?: string | null
}) {
  const id = newId()
  const created = await write<Block>(() =>
    id
      ? supabase.from('blocks').upsert({ id, ...block }, { onConflict: 'id' }).select('*').single()
      : supabase.from('blocks').insert(block).select('*').single(),
  )
  invalidateData('/rest/v1/blocks', block.node_id)
  return created
}

export async function updateBlock(id: string, patch: Partial<Block>) {
  const updated = await write<Block>(() =>
    supabase.from('blocks').update(patch).eq('id', id).select('*').single(),
  )
  invalidateData('/rest/v1/blocks', updated.node_id)
  return updated
}

export async function deleteBlock(id: string, nodeId: string) {
  await write<unknown>(async (attempt) => {
    const { data, error } = await supabase.from('blocks').delete().eq('id', id).select('id')
    if (error) return { data: null, error }
    if (!data?.length && attempt === 0) return { data: null, error: { code: 'PGRST116', message: 'Не удалось удалить' } }
    return { data: data ?? [], error: null }
  })
  invalidateData('/rest/v1/blocks', nodeId)
}

export async function reorderBlocks(nodeId: string, items: { id: string; position: number }[]) {
  if (!items.length) return
  await Promise.all(
    items.map((i) =>
      write(() => supabase.from('blocks').update({ position: i.position }).eq('id', i.id).select('id').single()),
    ),
  )
  invalidateData('/rest/v1/blocks', nodeId)
}

/** Карточки без единого блока — «что ещё не написано» */
export async function fetchEmptyCards() {
  const { data, error } = await supabase.rpc('empty_cards')
  if (error) {
    // запасной путь, если функции нет: тянем карточки и блоки отдельно
    const [cards, blocks] = await Promise.all([
      fetchAllPages<{ id: string; title: string }>((from, to) =>
        supabase.from('nodes').select('id, title').eq('kind', 'card').order('id').range(from, to),
      ),
      fetchAllPages<{ node_id: string }>((from, to) =>
        supabase.from('blocks').select('node_id').order('id').range(from, to),
      ),
    ])
    const filled = new Set(blocks.map((b) => b.node_id))
    return cards.filter((c) => !filled.has(c.id))
  }
  return (data ?? []) as { id: string; title: string }[]
}

/* ══════════════════════════════════════════════════════════════════════════
   Поиск, файлы, права
   ══════════════════════════════════════════════════════════════════════════ */

export async function searchAll(query: string, limit = 40) {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await supabase.rpc('search_all', { q, lim: limit })
  if (error) throw new Error(describeError(error))
  // Старая версия search_all не отдаёт цвет — тогда метка будет золотой
  return ((data ?? []) as SearchHit[]).map((hit) => ({ ...hit, color: hit.color ?? null }))
}

export interface UploadedImage {
  url: string
  width: number | null
  height: number | null
}

/** Картинка уменьшается до разумного размера и уходит в хранилище с повторами при обрыве */
export async function uploadImage(file: File): Promise<UploadedImage> {
  const prepared = await shrinkImage(file)
  const path = `${new Date().getFullYear()}/${newId() ?? Date.now().toString(36)}.${prepared.ext}`
  const bucket = supabase.storage.from(STORAGE_BUCKET)

  await write(async () => {
    const { data, error } = await bucket.upload(path, prepared.blob, {
      cacheControl: '31536000',
      upsert: false,
      contentType: prepared.blob.type || undefined,
    })
    // Повтор после обрыва связи: файл уже мог долететь — это тоже успех
    if (error && /already exists|duplicate/i.test(error.message)) return { data: { path }, error: null }
    return { data, error }
  })

  return {
    url: bucket.getPublicUrl(path).data.publicUrl,
    width: prepared.width,
    height: prepared.height,
  }
}

export async function checkIsEditor(userId: string) {
  const { data, error } = await supabase
    .from('editors')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return false
  return Boolean(data)
}
