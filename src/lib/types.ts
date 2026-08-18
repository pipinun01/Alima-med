/** Уровни дерева — те же, что в бумажной логике конспектов */
export type NodeKind = 'chapter' | 'topic' | 'branch' | 'card'

/** Цветные метки блоков, чтобы не путать термины между собой */
export type TermColor = 'red' | 'green' | 'gold'

export interface DbNode {
  id: string
  parent_id: string | null
  title: string
  subtitle: string | null
  kind: NodeKind
  icon: string | null
  position: number
  created_at: string
  updated_at: string
}

/** Узел дерева: то же самое плюс потомки и глубина */
export type TreeNode = DbNode & {
  children: TreeNode[]
  depth: number
}

/** Блок карточки: один термин со своей меткой, текстом и фотографиями */
export interface Block {
  id: string
  node_id: string
  label: string
  color: TermColor
  content: unknown | null
  content_text: string | null
  position: number
  created_at: string
  updated_at: string
}

export interface SearchHit {
  id: string
  title: string
  kind: NodeKind
  path: string | null
  label: string | null
  snippet: string | null
  rank: number
}

export const KIND_META: Record<
  NodeKind,
  { one: string; few: string; many: string; child: NodeKind | null; childLabel: string }
> = {
  chapter: { one: 'глава',    few: 'главы',    many: 'глав',      child: 'topic',  childLabel: 'Тема' },
  topic:   { one: 'тема',     few: 'темы',     many: 'тем',       child: 'branch', childLabel: 'Ветка' },
  branch:  { one: 'ветка',    few: 'ветки',    many: 'веток',     child: 'card',   childLabel: 'Карточка' },
  card:    { one: 'карточка', few: 'карточки', many: 'карточек',  child: null,     childLabel: '' },
}

/** Уровень по умолчанию для новой записи на данной глубине */
export const KIND_BY_DEPTH: NodeKind[] = ['chapter', 'topic', 'branch', 'card']

export const TERM_LABELS: Record<TermColor, { name: string; hint: string }> = {
  red:   { name: 'Красный', hint: 'Важное / патология / не перепутать' },
  green: { name: 'Зелёный', hint: 'Норма / базовое понятие' },
  gold:  { name: 'Золотой', hint: 'Ключевой термин / запомнить' },
}
