import type { DbNode, NodeKind, TreeNode } from './types'

export interface TreeIndex {
  roots: TreeNode[]
  byId: Map<string, TreeNode>
}

type FlatNode = DbNode

/** Плоский список из БД → дерево. Один запрос вместо похода на сервер за каждым уровнем. */
export function buildTree(flat: FlatNode[]): TreeIndex {
  const byId = new Map<string, TreeNode>()
  for (const n of flat) byId.set(n.id, { ...n, children: [], depth: 0 })

  const roots: TreeNode[] = []
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sort = (list: TreeNode[], depth: number) => {
    list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, 'ru'))
    for (const child of list) {
      child.depth = depth
      sort(child.children, depth + 1)
    }
  }
  sort(roots, 0)

  return { roots, byId }
}

/** Цепочка от корня до узла — для хлебных крошек */
export function pathTo(byId: Map<string, TreeNode>, id: string): TreeNode[] {
  const chain: TreeNode[] = []
  let current = byId.get(id)
  const guard = new Set<string>()
  while (current && !guard.has(current.id)) {
    guard.add(current.id)
    chain.unshift(current)
    current = current.parent_id ? byId.get(current.parent_id) : undefined
  }
  return chain
}

/** Сколько карточек лежит внутри узла, включая вложенные */
export function countCards(node: TreeNode): number {
  let total = node.kind === 'card' ? 1 : 0
  for (const child of node.children) total += countCards(child)
  return total
}

export function descendantIds(node: TreeNode): string[] {
  const out: string[] = []
  const walk = (n: TreeNode) => {
    for (const c of n.children) {
      out.push(c.id)
      walk(c)
    }
  }
  walk(node)
  return out
}

export interface ParentChoice {
  /** null — верхний уровень, то есть запись станет главой */
  id: string | null
  label: string
  depth: number
}

/**
 * Куда можно переложить запись: любой раздел (не карточка), кроме неё самой
 * и её потомков — внутрь себя переезжать нельзя.
 */
export function parentChoices(index: TreeIndex, nodeId: string): ParentChoice[] {
  const self = index.byId.get(nodeId)
  const banned = new Set(self ? [nodeId, ...descendantIds(self)] : [])
  const out: ParentChoice[] = [{ id: null, label: 'Верхний уровень — среди глав', depth: 0 }]
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      if (n.kind === 'card' || banned.has(n.id)) continue
      out.push({ id: n.id, label: n.title, depth: n.depth + 1 })
      walk(n.children)
    }
  }
  walk(index.roots)
  return out
}

/** Следующая позиция среди соседей */
export function nextPosition(siblings: TreeNode[]): number {
  return siblings.reduce((max, s) => Math.max(max, s.position), -1) + 1
}

/** Что ввели в форме записи — название, подзаголовок, тип, иконка и, возможно, новый раздел */
export interface NodeFormInput {
  title: string
  subtitle: string
  kind: NodeKind
  icon: string
  parent_id?: string | null
}

/**
 * Превращает форму в патч для updateNode. Если раздел сменился, запись встаёт
 * в конец нового списка соседей.
 */
export function nodePatch(index: TreeIndex, node: DbNode, value: NodeFormInput): Partial<DbNode> {
  const patch: Partial<DbNode> = {
    title: value.title,
    subtitle: value.subtitle || null,
    kind: value.kind,
    icon: value.icon || null,
  }
  if (value.parent_id !== undefined && value.parent_id !== node.parent_id) {
    const siblings = value.parent_id ? (index.byId.get(value.parent_id)?.children ?? []) : index.roots
    patch.parent_id = value.parent_id
    patch.position = nextPosition(siblings)
  }
  return patch
}
