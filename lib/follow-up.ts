// ─── Контрольные визиты/консультации + переход open↔closed — чистая логика ────
//
// Единая каноническая копия. Модули «Медпункт» и «Психолог» держали побайтово
// одинаковые isUpcomingFollowUp / isOverdueFollowUp / canTransition* у себя;
// теперь они здесь, а модули их реэкспортируют под своими историческими именами.
// Никаких обращений к БД и НИКАКИХ вызовов Date.now() — «сегодня» передаётся
// параметром todayISO, поэтому логика детерминирована. Даты — ISO 'YYYY-MM-DD';
// сравниваются лексикографически (для этого формата совпадает с хронологическим).

export interface FollowUpLike {
  follow_up_date: string | null
  status: string
}

/**
 * Предстоит ли контроль: запись ещё открыта, дата контроля задана и НЕ раньше
 * сегодня (граница — сегодня — считается предстоящей, НЕ просроченной).
 */
export function isUpcomingFollowUp(x: FollowUpLike, todayISO: string): boolean {
  return x.status === 'open' && x.follow_up_date !== null && x.follow_up_date >= todayISO
}

/**
 * Просрочен ли контроль: запись ещё открыта, дата контроля задана и СТРОГО
 * раньше сегодня. Закрытые записи не учитываются (status !== 'open').
 */
export function isOverdueFollowUp(x: FollowUpLike, todayISO: string): boolean {
  return x.status === 'open' && x.follow_up_date !== null && x.follow_up_date < todayISO
}

/**
 * Допустим ли переход статуса. Разрешено open↔closed (открыть закрытую запись
 * заново тоже можно). Переход в тот же статус (from === to) запрещён; любой
 * неизвестный статус — запрещён.
 */
export function canToggleOpenClosed(from: string, to: string): boolean {
  if (from === to) return false
  if (from === 'open' && to === 'closed') return true
  if (from === 'closed' && to === 'open') return true
  return false
}
