import type { Lang } from '@/lib/i18n/translations'
import type { PrivilegeLevel, PrivilegeRisk } from '@/types/database'
import { pickLang } from './localize'

// ─── Сборка дерева отображения прав ──────────────────────────────────────────
//
// Дерево (security_tree_nodes / security_tree_items) — ТОЛЬКО показ и
// группировка. Права живут в role_privileges / person_privileges, и здешние
// функции их не читают и не меняют. Поэтому как бы администратор ни
// перетасовал дерево, ничьи права от этого не меняются.
//
// Сборка вынесена в чистую функцию: именно здесь легко потерять право (узел без
// родителя, право без узла), а потерянное право означает, что администратор его
// не видит и не может закрыть. Тесты рядом проверяют ровно это.

export interface CatalogEntryInput {
  module: string
  privilege_code: string
  name_he: string | null
  name_ru: string | null
  name_en: string | null
  description_he: string | null
  description_ru: string | null
  description_en: string | null
  level: PrivilegeLevel | null
  risk: PrivilegeRisk
  allowed_scopes: string[]
  is_legacy: boolean
  superseded_by: string | null
  sort_order: number
}

export interface NodeInput {
  id: string
  parent_id: string | null
  sort_order: number
  name_he: string
  name_ru: string | null
  name_en: string | null
  description_he: string | null
  description_ru: string | null
  description_en: string | null
  module_code: string | null
  icon: string | null
  color: string | null
  department_id: string | null
}

export interface ItemInput {
  node_id: string
  module: string
  privilege_code: string
  sort_order: number
}

/** Право так, как его видит экран: подпись на языке пользователя, без кода. */
export interface CatalogEntry {
  /** Технический ключ. На экране НЕ показывается — нужен для сохранения. */
  module: string
  code: string
  /** null = перевода нет ни на одном языке: экран пишет «нет подписи». */
  name: string | null
  /** null = объяснение не написано: экран помечает «нет объяснения». */
  description: string | null
  level: PrivilegeLevel | null
  risk: PrivilegeRisk
  allowedScopes: string[]
  isLegacy: boolean
  supersededBy: string | null
}

export interface TreeNode {
  id: string
  parentId: string | null
  sortOrder: number
  name: string | null
  description: string | null
  moduleCode: string | null
  icon: string | null
  color: string | null
  departmentId: string | null
  /**
   * Подписи на всех трёх языках как они лежат в базе — только для формы
   * правки. name/description выше уже выбраны под язык экрана, и форма, взяв
   * их, записала бы русский текст в поле иврита, а пустые RU/EN стёрли бы
   * существующие переводы.
   */
  texts: NodeTexts
  children: TreeNode[]
  items: CatalogEntry[]
}

export interface NodeTexts {
  name_he: string
  name_ru: string
  name_en: string
  description_he: string
  description_ru: string
  description_en: string
}

export interface BuiltTree {
  roots: TreeNode[]
  /** Права, не разложенные ни по одному узлу. Экран показывает их отдельно. */
  unassigned: CatalogEntry[]
}

/** Ключ права. Разделитель '::' безопасен: коды — это [a-z_]+. */
export function privilegeKey(module: string, code: string): string {
  return `${module}::${code}`
}

function toEntry(lang: Lang, c: CatalogEntryInput): CatalogEntry {
  return {
    module: c.module,
    code: c.privilege_code,
    name: pickLang(lang, { he: c.name_he, ru: c.name_ru, en: c.name_en }),
    description: pickLang(lang, {
      he: c.description_he, ru: c.description_ru, en: c.description_en,
    }),
    level: c.level,
    risk: c.risk,
    allowedScopes: c.allowed_scopes ?? [],
    isLegacy: c.is_legacy,
    supersededBy: c.superseded_by,
  }
}

type Sortable = { sortOrder: number; name: string | null }
const byOrderThenName = (a: Sortable, b: Sortable) =>
  a.sortOrder - b.sortOrder || (a.name ?? '').localeCompare(b.name ?? '')

/**
 * Собирает дерево для экрана.
 *
 * Гарантия, ради которой функция существует: НИ ОДНО право каталога не
 * исчезает. Право без узла попадает в `unassigned`; узел, чей родитель не
 * найден, становится корнем, а не пропадает вместе со своим поддеревом.
 */
export function buildTree(
  lang: Lang,
  nodes: readonly NodeInput[],
  items: readonly ItemInput[],
  catalog: readonly CatalogEntryInput[],
): BuiltTree {
  const catalogByKey = new Map(
    catalog.map(c => [privilegeKey(c.module, c.privilege_code), c]),
  )

  const built = new Map<string, TreeNode>()
  for (const n of nodes) {
    built.set(n.id, {
      id: n.id,
      parentId: n.parent_id,
      sortOrder: n.sort_order,
      name: pickLang(lang, { he: n.name_he, ru: n.name_ru, en: n.name_en }),
      description: pickLang(lang, {
        he: n.description_he, ru: n.description_ru, en: n.description_en,
      }),
      moduleCode: n.module_code,
      icon: n.icon,
      color: n.color,
      departmentId: n.department_id,
      texts: {
        name_he: n.name_he ?? '',
        name_ru: n.name_ru ?? '',
        name_en: n.name_en ?? '',
        description_he: n.description_he ?? '',
        description_ru: n.description_ru ?? '',
        description_en: n.description_en ?? '',
      },
      children: [],
      items: [],
    })
  }

  // Раскладываем права по узлам. Пункт, ссылающийся на исчезнувший узел или на
  // право, которого больше нет в каталоге, игнорируется — но само право тогда
  // остаётся неразложенным и попадёт в unassigned ниже.
  const placed = new Set<string>()
  const itemsSorted = [...items].sort((a, b) => a.sort_order - b.sort_order)
  for (const it of itemsSorted) {
    const node = built.get(it.node_id)
    if (!node) continue
    const k = privilegeKey(it.module, it.privilege_code)
    const cat = catalogByKey.get(k)
    if (!cat) continue
    node.items.push(toEntry(lang, cat))
    placed.add(k)
  }

  // Связываем родителей и детей. Узел с потерянным родителем поднимается в
  // корень: иначе он и всё его поддерево пропали бы с экрана молча.
  const roots: TreeNode[] = []
  for (const node of built.values()) {
    const parent = node.parentId ? built.get(node.parentId) : undefined
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }

  const sortDeep = (list: TreeNode[]) => {
    list.sort(byOrderThenName)
    for (const n of list) sortDeep(n.children)
  }
  sortDeep(roots)

  const unassigned = catalog
    .filter(c => !placed.has(privilegeKey(c.module, c.privilege_code)))
    .map(c => toEntry(lang, c))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))

  return { roots, unassigned }
}

/** Сколько прав в узле вместе со всем его поддеревом. */
export function countPrivileges(node: TreeNode): number {
  return node.items.length + node.children.reduce((sum, c) => sum + countPrivileges(c), 0)
}

/** Плоский список прав узла и его поддерева — выдача целым узлом идёт по нему. */
export function collectPrivileges(node: TreeNode): CatalogEntry[] {
  return [...node.items, ...node.children.flatMap(collectPrivileges)]
}
