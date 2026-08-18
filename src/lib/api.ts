import { supabase, STORAGE_BUCKET } from './supabase'
import type { Block, DbNode, NodeKind, SearchHit, TermColor } from './types'

/* ══════════════════════════════════════════════════════════════════════════
   Дерево
   ══════════════════════════════════════════════════════════════════════════ */

const NODE_COLUMNS =
  'id, parent_id, title, subtitle, kind, icon, position, created_at, updated_at'

/** Всё дерево одним запросом — навигация дальше идёт без походов на сервер */
export async function fetchTree() {
  const { data, error } = await supabase
    .from('nodes')
    .select(NODE_COLUMNS)
    .order('position', { ascending: true })
  if (error) throw error
  return (data ?? []) as DbNode[]
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
  const { data, error } = await supabase.from('nodes').insert(node).select(NODE_COLUMNS).single()
  if (error) throw error
  return data as DbNode
}

export async function updateNode(id: string, patch: Partial<DbNode>) {
  const { data, error } = await supabase
    .from('nodes')
    .update(patch)
    .eq('id', id)
    .select(NODE_COLUMNS)
    .single()
  if (error) throw error
  return data as DbNode
}

/** Удаление каскадное: потомки уходят вместе с родителем (ON DELETE CASCADE) */
export async function deleteNode(id: string) {
  const { error } = await supabase.from('nodes').delete().eq('id', id)
  if (error) throw error
}

export async function reorderNodes(items: { id: string; position: number }[]) {
  await Promise.all(
    items.map((i) => supabase.from('nodes').update({ position: i.position }).eq('id', i.id)),
  )
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
  if (error) throw error
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
  const { data, error } = await supabase.from('blocks').insert(block).select('*').single()
  if (error) throw error
  return data as Block
}

export async function updateBlock(id: string, patch: Partial<Block>) {
  const { data, error } = await supabase.from('blocks').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return data as Block
}

export async function deleteBlock(id: string) {
  const { error } = await supabase.from('blocks').delete().eq('id', id)
  if (error) throw error
}

export async function reorderBlocks(items: { id: string; position: number }[]) {
  await Promise.all(
    items.map((i) => supabase.from('blocks').update({ position: i.position }).eq('id', i.id)),
  )
}

/** Карточки без единого блока — «что ещё не написано» */
export async function fetchEmptyCards() {
  const { data, error } = await supabase.rpc('empty_cards')
  if (error) {
    // запасной путь, если функции нет: тянем карточки и блоки отдельно
    const [{ data: cards }, { data: blocks }] = await Promise.all([
      supabase.from('nodes').select('id, title').eq('kind', 'card'),
      supabase.from('blocks').select('node_id'),
    ])
    const filled = new Set((blocks ?? []).map((b: { node_id: string }) => b.node_id))
    return ((cards ?? []) as { id: string; title: string }[]).filter((c) => !filled.has(c.id))
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
  if (error) throw error
  return (data ?? []) as SearchHit[]
}

export async function uploadImage(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { cacheControl: '31536000', upsert: false })
  if (error) throw error
  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl
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
