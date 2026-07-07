// ─── Документы: срок годности и статистика реестра — чистая логика ───────────
//
// Никаких обращений к БД и НИКАКИХ вызовов Date.now() — «сегодня» всегда
// передаётся параметром todayISO, поэтому логика детерминирована и целиком
// покрывается юнит-тестами (expiry.test.ts, vitest). Даты — ISO 'YYYY-MM-DD';
// сравниваются лексикографически (для этого формата совпадает с хронологическим
// порядком). daysUntilExpiry считает разницу через UTC-полночь (точные целые
// дни). Тот же приём анкоринга «сегодня», что в lib/doctor/medical.ts.

/** Минимальная форма документа для проверок срока годности. */
export interface DocExpiryLike {
  expiry_date: string | null
  status: string
}

/** Полная форма документа для агрегатов (плюс тип). */
export interface DocLike extends DocExpiryLike {
  doc_type: string
}

/**
 * Целое число дней от сегодня до даты окончания expiryISO. Отрицательное — дата
 * в прошлом (документ уже просрочен), 0 — истекает сегодня. Обе даты берутся как
 * UTC-полночь, поэтому разница — точное кратное суткам. Чистая: «сегодня»
 * передаётся, Date.now НЕ вызывается.
 */
export function daysUntilExpiry(expiryISO: string, todayISO: string): number {
  const target = Date.parse(`${expiryISO}T00:00:00Z`)
  const today = Date.parse(`${todayISO}T00:00:00Z`)
  return Math.round((target - today) / 86_400_000)
}

/**
 * Просрочен ли документ: он активен, дата окончания задана и СТРОГО раньше
 * сегодня. Архивные документы не считаются просроченными (status !== 'active').
 * Граница — дата окончания === сегодня — НЕ просрочена (это «истекает сегодня»,
 * т.е. ещё действителен последний день).
 */
export function isExpired(d: DocExpiryLike, todayISO: string): boolean {
  return d.status === 'active' && d.expiry_date !== null && d.expiry_date < todayISO
}

/**
 * Истекает ли скоро: документ активен, дата окончания задана, НЕ раньше сегодня
 * (иначе это уже просрочен, а не «скоро») и до неё осталось не больше
 * thresholdDays дней. Граница «дата === сегодня» попадает сюда (0 <= threshold),
 * а НЕ в isExpired.
 */
export function isExpiringSoon(
  d: DocExpiryLike, todayISO: string, thresholdDays = 30,
): boolean {
  return (
    d.status === 'active' &&
    d.expiry_date !== null &&
    d.expiry_date >= todayISO &&
    daysUntilExpiry(d.expiry_date, todayISO) <= thresholdDays
  )
}

export interface DocumentStats {
  total: number
  active: number
  archived: number
  expired: number
  expiring_soon: number
  by_type: Record<string, number>
}

/**
 * Агрегаты по списку документов: всего / активных / архивных, сколько из
 * активных просрочено и сколько истекает скоро, плюс разбивка по типам (все
 * документы, независимо от статуса). expired и expiring_soon взаимоисключающи
 * (см. границу «сегодня» в isExpired/isExpiringSoon) и учитывают только активные.
 */
export function documentStats(docs: DocLike[], todayISO: string): DocumentStats {
  let active = 0
  let archived = 0
  let expired = 0
  let expiringSoon = 0
  const byType: Record<string, number> = {}
  for (const d of docs) {
    if (d.status === 'active') active++
    else if (d.status === 'archived') archived++
    if (isExpired(d, todayISO)) expired++
    if (isExpiringSoon(d, todayISO)) expiringSoon++
    byType[d.doc_type] = (byType[d.doc_type] ?? 0) + 1
  }
  return {
    total: docs.length,
    active,
    archived,
    expired,
    expiring_soon: expiringSoon,
    by_type: byType,
  }
}
