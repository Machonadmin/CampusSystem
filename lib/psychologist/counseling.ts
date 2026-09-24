// ─── Психолог: контрольные консультации и статусы сессий — чистая логика ──────
//
// Никаких обращений к БД и НИКАКИХ вызовов Date.now() — «сегодня» всегда
// передаётся параметром todayISO, поэтому логика детерминирована и целиком
// покрывается юнит-тестами (counseling.test.ts, vitest). Даты — ISO 'YYYY-MM-DD';
// сравниваются лексикографически (для этого формата совпадает с хронологическим
// порядком). daysUntil считает разницу через UTC-полночь (точные целые дни).

// daysUntil — общий чистый date-хелпер (lib/dates.ts). Контрольные консультации
// (is*FollowUp) и переход статуса сессии (open↔closed) — общая логика lib/follow-up.ts,
// реэкспортируется под историческими именами (canTransitionSession = canToggleOpenClosed).
import { isUpcomingFollowUp, isOverdueFollowUp, canToggleOpenClosed } from '@/lib/follow-up'

export interface SessionLike {
  follow_up_date: string | null
  status: string
}

export { daysUntil } from '@/lib/dates'
export { isUpcomingFollowUp, isOverdueFollowUp }
export { canToggleOpenClosed as canTransitionSession }

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
