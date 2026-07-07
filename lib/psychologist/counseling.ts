// ─── Психолог: контрольные консультации и статусы сессий — чистая логика ──────
//
// Никаких обращений к БД и НИКАКИХ вызовов Date.now() — «сегодня» всегда
// передаётся параметром todayISO, поэтому логика детерминирована и целиком
// покрывается юнит-тестами (counseling.test.ts, vitest). Даты — ISO 'YYYY-MM-DD';
// сравниваются лексикографически (для этого формата совпадает с хронологическим
// порядком). daysUntil считает разницу через UTC-полночь (точные целые дни).

export interface SessionLike {
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
 * Предстоит ли контрольная консультация: сессия ещё открыта, дата контроля
 * задана и НЕ раньше сегодня (граница — сегодня — считается предстоящей, НЕ
 * просроченной).
 */
export function isUpcomingFollowUp(s: SessionLike, todayISO: string): boolean {
  return s.status === 'open' && s.follow_up_date !== null && s.follow_up_date >= todayISO
}

/**
 * Просрочена ли контрольная консультация: сессия ещё открыта, дата контроля
 * задана и СТРОГО раньше сегодня. Закрытые сессии не учитываются
 * (status !== 'open').
 */
export function isOverdueFollowUp(s: SessionLike, todayISO: string): boolean {
  return s.status === 'open' && s.follow_up_date !== null && s.follow_up_date < todayISO
}

/**
 * Допустим ли переход статуса сессии. Разрешено open↔closed (открыть закрытую
 * сессию заново тоже можно). Переход в тот же статус (from === to) запрещён;
 * любой неизвестный статус — запрещён.
 */
export function canTransitionSession(from: string, to: string): boolean {
  if (from === to) return false
  if (from === 'open' && to === 'closed') return true
  if (from === 'closed' && to === 'open') return true
  return false
}

export interface SessionStats {
  total: number
  open: number
  closed: number
  upcoming_followups: number
  overdue_followups: number
}

/**
 * Агрегаты по списку сессий: всего / открытых / закрытых и сколько из открытых
 * имеют предстоящую либо просроченную контрольную консультацию. Закрытые сессии
 * в счётчики контроля не попадают (см. is*FollowUp — требуют status === 'open').
 */
export function sessionStats(sessions: SessionLike[], todayISO: string): SessionStats {
  let open = 0
  let closed = 0
  let upcoming = 0
  let overdue = 0
  for (const s of sessions) {
    if (s.status === 'open') open++
    else if (s.status === 'closed') closed++
    if (isUpcomingFollowUp(s, todayISO)) upcoming++
    if (isOverdueFollowUp(s, todayISO)) overdue++
  }
  return {
    total: sessions.length,
    open,
    closed,
    upcoming_followups: upcoming,
    overdue_followups: overdue,
  }
}
