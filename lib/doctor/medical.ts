// ─── Медпункт: контрольные визиты и статусы приёмов — чистая логика ──────────
//
// Никаких обращений к БД и НИКАКИХ вызовов Date.now() — «сегодня» всегда
// передаётся параметром todayISO, поэтому логика детерминирована и целиком
// покрывается юнит-тестами (medical.test.ts, vitest). Даты — ISO 'YYYY-MM-DD';
// сравниваются лексикографически (для этого формата совпадает с хронологическим
// порядком). daysUntil считает разницу через UTC-полночь (точные целые дни).

// daysUntil — общий чистый date-хелпер (lib/dates.ts). Контрольные визиты
// (is*FollowUp) и переход статуса приёма (open↔closed) — общая логика lib/follow-up.ts,
// реэкспортируется под историческими именами (canTransitionVisit = canToggleOpenClosed).
import { isUpcomingFollowUp, isOverdueFollowUp, canToggleOpenClosed } from '@/lib/follow-up'

export interface VisitLike {
  follow_up_date: string | null
  status: string
}

export { daysUntil } from '@/lib/dates'
export { isUpcomingFollowUp, isOverdueFollowUp }
export { canToggleOpenClosed as canTransitionVisit }

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
