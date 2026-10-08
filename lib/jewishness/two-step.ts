/**
 * Двухшаговая проверка еврейства (spec §3.3, решение архитектора): расширяет
 * СУЩЕСТВУЮЩИЙ механизм статусов (education_journeys.jewishness_status + история),
 * НЕ создавая параллельную таблицу. Один источник правды, два действующих лица:
 *   • первичная проверка — Моше (сканы). Это ДЕЙСТВИЕ, а не статус: статус
 *     остаётся 'pending' («בבדיקה»), фиксируются initial_checked_by/at.
 *   • final_approve — Chana (оригиналы). Статус → 'verified' («אושר», финал).
 * Статусов ровно три (владелец, M16): pending «בבדיקה» · verified «אושר» ·
 * rejected «לא אושר».
 * Финальное одобрение ('verified') — ворота в список шибуца кодеша (плюс
 * завершённый приём). Разделение משה⇄חנה проверяется на сервере.
 *
 * Чистые функции — тестируются без БД.
 */

/** Финальный (одобренный) статус — ворота в кодеш. */
export const JEWISHNESS_FINAL_APPROVED = 'verified'

export interface JewishnessCaps {
  isSuperadmin: boolean
  hasAccess: boolean          // jewishness.access
  canInitialCheck: boolean    // education.jewishness_initial_check (Moshe)
  canFinalApprove: boolean    // education.jewishness_final_approve (Chana)
}

/**
 * Может ли актор установить данный статус (server-side разделение полномочий):
 *   • 'verified' — только jewishness_final_approve (Chana);
 *   • 'rejected' — любой из двух;
 *   • 'pending'  — любой держатель jewishness.access (нерешающее состояние).
 * Суперадмин — всегда.
 */
export function canSetJewishnessStatus(status: string, caps: JewishnessCaps): boolean {
  if (caps.isSuperadmin) return true
  switch (status) {
    case JEWISHNESS_FINAL_APPROVED: return caps.canFinalApprove
    case 'rejected':                return caps.canInitialCheck || caps.canFinalApprove
    case 'pending':                 return caps.hasAccess
    default:                        return false
  }
}

/** Может ли актор отметить первичную проверку (только Moshe; суперадмин — всегда). */
export function canDoInitialCheck(caps: JewishnessCaps): boolean {
  return caps.isSuperadmin || caps.canInitialCheck
}

/** Прошла ли студентка финальное одобрение (ворота в кодеш). */
export function isKodeshJewishnessEligible(jewishnessStatus: string | null | undefined): boolean {
  return jewishnessStatus === JEWISHNESS_FINAL_APPROVED
}
