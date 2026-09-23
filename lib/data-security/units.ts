import type { Lang } from '@/lib/i18n/translations'
import { localizedDeptName } from '@/lib/departments/localized-name'
import { expandDepartmentTree, type DepartmentEdge } from '@/lib/permissions/scope'

// ─── Оргструктура как ГРАНИЦА доступа ────────────────────────────────────────
//
// Единица в оргструктуре — это и есть область действия права со scope =
// 'department'. Посаженный на единицу человек получает ЕЁ И ВСЁ, ЧТО НИЖЕ
// (expandDepartmentTree идёт вниз по дереву). Отсюда прямое следствие, ради
// которого всё это и делается:
//
//   руководитель сидит на «Колледже»      → видит оба потока под ним
//   секретарь сидит на «Колледж · 3 года» → видит только этот поток
//
// ВАЖНОЕ ОТЛИЧИЕ ОТ ДЕРЕВА ОТОБРАЖЕНИЯ (lib/data-security/tree.ts): то дерево —
// косметика, его перестановка не меняет ничьих прав. ЭТО дерево — настоящая
// граница: перенос единицы или пересадка человека меняет то, что он видит,
// немедленно и без всякой выдачи прав. Поэтому и право на правку отдельное
// (data_security.manage_units, risk = critical).

export interface DepartmentInput {
  id: string
  name: string
  name_he: string | null
  name_en: string | null
  parent_id: string | null
  sort_order: number | null
  is_educational_institution: boolean
}

export interface SeatInput {
  person_id: string
  department_id: string
  is_head: boolean
  end_date: string | null
}

export interface UnitNode {
  id: string
  parentId: string | null
  name: string
  isEducational: boolean
  /** Сотрудники, посаженные именно на эту единицу (без потомков). */
  seatCount: number
  /**
   * КТО именно посажен на эту единицу. Раньше дерево знало только «сколько»,
   * и посадить человека можно было лишь с другой стороны — из карточки
   * сотрудника. Владелец попросил обратное направление: «стою на пнимии и
   * добавляю ей людей».
   *
   * Имён здесь нет намеренно: их разрешает экран по уже загруженному списку
   * персонала. Иначе в этот чистый слой пришлось бы тащить язык и загрузку.
   */
  seats: { personId: string; isHead: boolean }[]
  /** Сотрудники этой единицы и всего, что под ней, — сколько человек её «видит». */
  seatCountDeep: number
  children: UnitNode[]
}

const byName = (a: UnitNode, b: UnitNode) => a.name.localeCompare(b.name)

/**
 * Строит дерево единиц с подсчётом посаженных.
 *
 * Как и в дереве отображения, единица с потерянным родителем поднимается в
 * корень, а не исчезает вместе со своим поддеревом: пропавшая с экрана единица
 * означала бы, что администратор не видит границу, которая при этом действует.
 */
export function buildUnitTree(
  lang: Lang,
  departments: readonly DepartmentInput[],
  seats: readonly SeatInput[],
  todayISO: string,
): UnitNode[] {
  const activeSeats = seats.filter(s => s.end_date === null || s.end_date > todayISO)

  const seatsByDept = new Map<string, { personId: string; isHead: boolean }[]>()
  for (const s of activeSeats) {
    const list = seatsByDept.get(s.department_id) ?? []
    // Один человек может быть записан на единицу дважды (две должности) —
    // на экране это одна строка, поэтому дубли схлопываются, а «глава»
    // побеждает: право главы, полученное хоть одной записью, реально.
    const existing = list.find(x => x.personId === s.person_id)
    if (existing) existing.isHead = existing.isHead || s.is_head
    else list.push({ personId: s.person_id, isHead: s.is_head })
    seatsByDept.set(s.department_id, list)
  }

  const built = new Map<string, UnitNode>()
  for (const d of departments) {
    built.set(d.id, {
      id: d.id,
      parentId: d.parent_id,
      name: localizedDeptName(d, lang),
      isEducational: d.is_educational_institution,
      seatCount: (seatsByDept.get(d.id) ?? []).length,
      seats: seatsByDept.get(d.id) ?? [],
      seatCountDeep: 0,
      children: [],
    })
  }

  const roots: UnitNode[] = []
  for (const node of built.values()) {
    const parent = node.parentId ? built.get(node.parentId) : undefined
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }

  const deepen = (n: UnitNode): number => {
    n.children.sort(byName)
    n.seatCountDeep = n.seatCount + n.children.reduce((s, c) => s + deepen(c), 0)
    return n.seatCountDeep
  }
  roots.sort(byName)
  roots.forEach(deepen)

  return roots
}

/**
 * Что именно откроет человеку посадка на эти единицы — в подписях, а не в id.
 * Экран показывает это рядом с выбором единицы, чтобы «дал доступ к колледжу»
 * не оказалось незаметно «дал доступ ко всему институту».
 */
export function seatReach(
  lang: Lang,
  departments: readonly DepartmentInput[],
  seatedDepartmentIds: readonly string[],
): { ids: string[]; names: string[] } {
  const edges: DepartmentEdge[] = departments.map(d => ({ id: d.id, parent_id: d.parent_id }))
  const ids = expandDepartmentTree([...seatedDepartmentIds], edges)
  const nameById = new Map(departments.map(d => [d.id, localizedDeptName(d, lang)]))
  return {
    ids,
    names: ids.map(id => nameById.get(id) ?? '').filter(Boolean).sort((a, b) => a.localeCompare(b)),
  }
}

/** Плоский список для выпадающих списков: подпись с отступом по глубине. */
export function flattenUnits(roots: readonly UnitNode[]): { id: string; label: string; depth: number }[] {
  const out: { id: string; label: string; depth: number }[] = []
  const walk = (nodes: readonly UnitNode[], depth: number) => {
    for (const n of nodes) {
      out.push({ id: n.id, label: n.name, depth })
      walk(n.children, depth + 1)
    }
  }
  walk(roots, 0)
  return out
}
