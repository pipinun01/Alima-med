import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '@/lib/api'
import { buildTree, type TreeIndex } from '@/lib/tree'
import { isConfigured } from '@/lib/supabase'
import { onDataUpdated } from '@/lib/sw-client'
import type { DbNode } from '@/lib/types'

type FlatNode = DbNode

interface TreeCtx extends TreeIndex {
  loading: boolean
  /** Дерево не загрузилось вовсе — показываем с кнопкой «Повторить» */
  error: string | null
  /** Короткое сообщение о неудавшейся правке; само исчезает */
  notice: string | null
  dismissNotice: () => void
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
  const [notice, setNotice] = useState<string | null>(null)
  const loaded = useRef(false)
  // Зеркало состояния для отката: updater в setFlat выполняется не сразу
  const flatRef = useRef<FlatNode[]>([])
  useEffect(() => {
    flatRef.current = flat
  }, [flat])

  const reload = useCallback(async () => {
    if (!isConfigured) {
      setLoading(false)
      return
    }
    try {
      setError(null)
      const data = await api.fetchTree()
      setFlat(data)
      loaded.current = true
    } catch (e) {
      // Если дерево уже показано, тихий повтор не должен его прятать
      if (!loaded.current) setError(e instanceof Error ? e.message : 'Не удалось загрузить дерево')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // Service worker отдал сохранённое дерево, а потом увидел, что на сервере оно другое
  useEffect(
    () => onDataUpdated((url) => {
      if (url.includes('/rest/v1/nodes')) void reload()
    }),
    [reload],
  )

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  const { roots, byId } = useMemo(() => buildTree(flat), [flat])

  const createNode = useCallback(async (node: api.NewNode) => {
    const created = await api.createNode(node)
    setFlat((prev) => [...prev.filter((n) => n.id !== created.id), created])
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
      // Обновляем только тех, у кого позиция действительно изменилась
      const updates = reordered
        .map((s, i) => ({ id: s.id, position: i }))
        .filter((u) => byId.get(u.id)?.position !== u.position)

      // Сначала меняем на экране, потом пишем; не записалось — возвращаем как было
      const snapshot = flatRef.current
      const map = new Map(updates.map((u) => [u.id, u.position]))
      setFlat((prev) => prev.map((n) => (map.has(n.id) ? { ...n, position: map.get(n.id)! } : n)))
      try {
        await api.reorderNodes(updates)
      } catch (e) {
        setFlat(snapshot)
        setNotice(`Порядок не сохранился: ${e instanceof Error ? e.message : 'ошибка'}`)
      }
    },
    [byId, roots],
  )

  const dismissNotice = useCallback(() => setNotice(null), [])

  const value = useMemo<TreeCtx>(
    () => ({
      roots, byId, loading, error, notice, dismissNotice,
      reload, createNode, updateNode, deleteNode, moveNode,
    }),
    [roots, byId, loading, error, notice, dismissNotice, reload, createNode, updateNode, deleteNode, moveNode],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTree() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTree должен вызываться внутри TreeProvider')
  return ctx
}
