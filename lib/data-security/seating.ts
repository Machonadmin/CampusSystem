import type { UnitNode } from './units'

// ─── Сборка набора единиц человека для сохранения ────────────────────────────
//
// Маршрут посадки (PUT /api/data-security/person/[personId]/seat) заменяет
// ВЕСЬ набор единиц человека целиком. Значит «добавить человека в пнимию» с
// экрана дерева — это на самом деле «прислать все его прежние единицы плюс
// эту». Забыть прежние здесь означало бы молча выселить человека отовсюду
// ещё откуда-то — самая дорогая ошибка в этом месте.
//
// Поэтому сборка набора вынесена в чистые функции: их видно в тесте целиком,
// без экрана и без сети.

export interface PersonSeat {
  departmentId: string
  isHead: boolean
}

/** Все единицы человека, собранные из дерева (оно уже отбросило истёкшие). */
export function personSeats(roots: readonly UnitNode[], personId: string): PersonSeat[] {
  const out: PersonSeat[] = []
  const walk = (n: UnitNode) => {
    for (const s of n.seats) {
      if (s.personId === personId) out.push({ departmentId: n.id, isHead: s.isHead })
    }
    n.children.forEach(walk)
  }
  roots.forEach(walk)
  return out
}

/**
 * Набор с добавленной единицей. Если человек уже в ней — обновляется только
 * признак главы (так же работает переключатель «ראש היחידה»).
 */
export function withSeat(
  current: readonly PersonSeat[],
  departmentId: string,
  isHead: boolean,
): PersonSeat[] {
  const next = current.map(s =>
    s.departmentId === departmentId ? { ...s, isHead } : s)
  if (!next.some(s => s.departmentId === departmentId)) {
    next.push({ departmentId, isHead })
  }
  return next
}

/** Набор без одной единицы. Остальные сохраняются — снимаем только эту. */
export function withoutSeat(
  current: readonly PersonSeat[],
  departmentId: string,
): PersonSeat[] {
  return current.filter(s => s.departmentId !== departmentId)
}

/** Формат тела запроса маршрута посадки. */
export function toSeatPayload(seats: readonly PersonSeat[]): {
  units: { department_id: string; is_head: boolean }[]
} {
  return { units: seats.map(s => ({ department_id: s.departmentId, is_head: s.isHead })) }
}

/** Строка staff_positions — ровно то, что нужно для расчёта посадок. */
export interface PositionRowInput {
  department_id: string | null
  is_head: boolean
  end_date: string | null
}

/**
 * ПРЯМЫЕ посадки человека — без расширения вниз по дереву.
 *
 * Окно «שינוי שיוך» раньше начинало с PersonAccess.departments, а там уже
 * расширенная область (единица + всё, что под ней, getUserDepartmentIds). В
 * итоге окно отмечало все под-единицы, а «ראש היחידה» всегда был снят —
 * сохранение без правок сажало человека в каждую под-единицу отдельно и
 * снимало с него главенство. Здесь — те же правила действующей посадки, что и
 * в маршруте посадки (end_date пуст или в будущем), и «глава» побеждает при
 * двух записях на одну единицу, как в buildUnitTree.
 */
export function activeSeatsFromPositions(
  rows: readonly PositionRowInput[],
  todayISO: string,
): PersonSeat[] {
  const out: PersonSeat[] = []
  for (const r of rows) {
    if (!r.department_id) continue
    if (!(r.end_date === null || r.end_date > todayISO)) continue
    const existing = out.find(s => s.departmentId === r.department_id)
    if (existing) existing.isHead = existing.isHead || !!r.is_head
    else out.push({ departmentId: r.department_id, isHead: !!r.is_head })
  }
  return out
}
