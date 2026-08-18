import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as api from '@/lib/api'
import { buildTree, type TreeIndex } from '@/lib/tree'
import { isConfigured } from '@/lib/supabase'
import type { DbNode } from '@/lib/types'

type FlatNode = DbNode

interface TreeCtx extends TreeIndex {
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  createNode: (node: api.NewNode) => Promise<FlatNode>
  updateNode: (id: string, patch: Partial<DbNode>) => Promise<void>
  deleteNode: (id: string) => Promise<void>
  moveNode: (id: string, direction: -1 | 1) => Promise<void>
}

const Ctx = createContext<TreeCtx | null>(null)

export function TreeProvider({ children }: { children: React.ReactNode }) {
  const [flat, setFlat] = useState<FlatNode[]>([])
  const [loading, setLoading] = useState(isConfigured)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!isConfigured) {
      setLoading(false)
      return
    }
    try {
      setError(null)
      const data = await api.fetchTree()
      setFlat(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить дерево')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const { roots, byId } = useMemo(() => buildTree(flat), [flat])

  const createNode = useCallback(async (node: api.NewNode) => {
    const created = await api.createNode(node)
    setFlat((prev) => [...prev, created])
    return created
  }, [])

  const updateNode = useCallback(async (id: string, patch: Partial<DbNode>) => {
    const updated = await api.updateNode(id, patch)
    setFlat((prev) => prev.map((n) => (n.id === id ? { ...n, ...updated } : n)))
  }, [])

  const deleteNode = useCallback(
    async (id: string) => {
      await api.deleteNode(id)
      // каскад в БД удаляет и потомков — повторяем это локально
      setFlat((prev) => {
        const doomed = new Set([id])
        let grew = true
        while (grew) {
          grew = false
          for (const n of prev) {
            if (n.parent_id && doomed.has(n.parent_id) && !doomed.has(n.id)) {
              doomed.add(n.id)
              grew = true
            }
          }
        }
        return prev.filter((n) => !doomed.has(n.id))
      })
    },
    [],
  )

  /** Переставляет узел среди соседей на одну позицию вверх или вниз */
  const moveNode = useCallback(
    async (id: string, direction: -1 | 1) => {
      const node = byId.get(id)
      if (!node) return
      const siblings = node.parent_id ? (byId.get(node.parent_id)?.children ?? []) : roots
      const index = siblings.findIndex((s) => s.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= siblings.length) return

      const reordered = [...siblings]
      const [moved] = reordered.splice(index, 1)
      reordered.splice(target, 0, moved)
      const updates = reordered.map((s, i) => ({ id: s.id, position: i }))

      setFlat((prev) => {
        const map = new Map(updates.map((u) => [u.id, u.position]))
        return prev.map((n) => (map.has(n.id) ? { ...n, position: map.get(n.id)! } : n))
      })
      await api.reorderNodes(updates)
    },
    [byId, roots],
  )

  const value = useMemo<TreeCtx>(
    () => ({ roots, byId, loading, error, reload, createNode, updateNode, deleteNode, moveNode }),
    [roots, byId, loading, error, reload, createNode, updateNode, deleteNode, moveNode],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTree() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTree должен вызываться внутри TreeProvider')
  return ctx
}
