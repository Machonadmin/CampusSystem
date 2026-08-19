// ─── Медпункт: контрольные визиты и статусы приёмов — чистая логика ──────────
//
// Никаких обращений к БД и НИКАКИХ вызовов Date.now() — «сегодня» всегда
// передаётся параметром todayISO, поэтому логика детерминирована и целиком
// покрывается юнит-тестами (medical.test.ts, vitest). Даты — ISO 'YYYY-MM-DD';
// сравниваются лексикографически (для этого формата совпадает с хронологическим
// порядком). daysUntil считает разницу через UTC-полночь (точные целые дни).

export interface VisitLike {
  follow_up_date: string | null
  status: string
}

/**
 * Целое число дней от сегодня до даты dateISO. Отрицательное — дата в прошлом,
 * 0 — сегодня. Обе даты берутся как UTC-полночь, поэтому разница — точное
 * кратное суткам. Чистая: «сегодня» передаётся, Date.now НЕ вызывается.
 */
export function daysUntil(dateISO: string, todayISO: string): number {
  const target = Date.parse(`${dateISO}T00:00:00Z`)
  const today = Date.parse(`${todayISO}T00:00:00Z`)
  return Math.round((target - today) / 86_400_000)
}

/**
 * Предстоит ли контрольный визит: приём ещё открыт, дата контроля задана и
 * НЕ раньше сегодня (граница — сегодня — считается предстоящим, НЕ просроченным).
 */
export function isUpcomingFollowUp(v: VisitLike, todayISO: string): boolean {
  return v.status === 'open' && v.follow_up_date !== null && v.follow_up_date >= todayISO
}

/**
 * Просрочен ли контрольный визит: приём ещё открыт, дата контроля задана и
 * СТРОГО раньше сегодня. Закрытые приёмы не учитываются (status !== 'open').
 */
export function isOverdueFollowUp(v: VisitLike, todayISO: string): boolean {
  return v.status === 'open' && v.follow_up_date !== null && v.follow_up_date < todayISO
}

/**
 * Допустим ли переход статуса приёма. Разрешено open↔closed (открыть закрытый
 * приём заново тоже можно). Переход в тот же статус (from === to) запрещён;
 * любой неизвестный статус — запрещён.
 */
export function canTransitionVisit(from: string, to: string): boolean {
  if (from === to) return false
  if (from === 'open' && to === 'closed') return true
  if (from === 'closed' && to === 'open') return true
  return false
}

export interface VisitStats {
  total: number
  open: number
  closed: number
  upcoming_followups: number
  overdue_followups: number
}

/**
 * Агрегаты по списку приёмов: всего / открытых / закрытых и сколько из открытых
 * имеют предстоящий либо просроченный контрольный визит. Закрытые приёмы в
 * счётчики контроля не попадают (см. is*FollowUp — требуют status === 'open').
 */
export function visitStats(visits: VisitLike[], todayISO: string): VisitStats {
  let open = 0
  let closed = 0
  let upcoming = 0
  let overdue = 0
  for (const v of visits) {
    if (v.status === 'open') open++
    else if (v.status === 'closed') closed++
    if (isUpcomingFollowUp(v, todayISO)) upcoming++
    if (isOverdueFollowUp(v, todayISO)) overdue++
  }
  return {
    total: visits.length,
    open,
    closed,
    upcoming_followups: upcoming,
    overdue_followups: overdue,
  }
}
