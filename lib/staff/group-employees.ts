// ─── «ניהול עובדים»: одна строка на человека ─────────────────────────────────
//
// /api/staff отдаёт строку на каждую ДЕЙСТВУЮЩУЮ должность (посадку). У кого
// несколько должностей, тот раньше стоял в списке столько же раз (замечание
// владельца: тестовый аккаунт Claude — 4 строки). Экран склеивает посадки в
// одну строку на человека; карточка сотрудника и так показывает все посадки.

export interface SeatLike {
  person_id: string
}

export interface PersonSeats<T extends SeatLike> {
  /** Первая посадка человека: из неё берутся имя, контакты, статус (они общие). */
  person: T
  /** Все посадки человека в исходном порядке (ведущая — первая, API сортирует is_head вперёд). */
  seats: T[]
}

/** Склеивает посадки по person_id, сохраняя порядок первого появления. */
export function groupSeatsByPerson<T extends SeatLike>(rows: readonly T[]): PersonSeats<T>[] {
  const byPerson = new Map<string, PersonSeats<T>>()
  for (const row of rows) {
    const cur = byPerson.get(row.person_id)
    if (cur) cur.seats.push(row)
    else byPerson.set(row.person_id, { person: row, seats: [row] })
  }
  return [...byPerson.values()]
}
