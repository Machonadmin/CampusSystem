/**
 * Двухшаговая проверка еврейства (spec §3.3, решение архитектора): расширяет
 * СУЩЕСТВУЮЩИЙ механизм статусов (education_journeys.jewishness_status + история),
 * НЕ создавая параллельную таблицу. Один источник правды, два действующих лица:
 *   • initial_check — Моше (сканы). Статус → 'initial_checked'.
 *   • final_approve — Chana (оригиналы). Статус → 'verified' (финал).
 * Финальное одобрение ('verified') — ворота в список шибуца кодеша (плюс
 * завершённый приём). Разделение משה⇄חנה проверяется на сервере.
 *
 * Чистые функции — тестируются без БД.
 */

/** Финальный (одобренный) статус — ворота в кодеш. */
export const JEWISHNESS_FINAL_APPROVED = 'verified'
/** Промежуточный статус после первичной проверки Моше. */
export const JEWISHNESS_INITIAL_CHECKED = 'initial_checked'

export interface JewishnessCaps {
  isSuperadmin: boolean
  hasAccess: boolean          // jewishness.access
  canInitialCheck: boolean    // education.jewishness_initial_check (Moshe)
  canFinalApprove: boolean    // education.jewishness_final_approve (Chana)
}

/**
 * Может ли актор установить данный статус (server-side разделение полномочий):
 *   • 'initial_checked' — только jewishness_initial_check (Moshe);
 *   • 'verified'        — только jewishness_final_approve (Chana);
 *   • 'rejected'        — любой из двух (или суперадмин);
 *   • pending/needs_review/partial — любой держатель jewishness.access
 *     (нерешающие состояния, прежнее поведение).
 * Суперадмин — всегда.
 */
export function canSetJewishnessStatus(status: string, caps: JewishnessCaps): boolean {
  if (caps.isSuperadmin) return true
  switch (status) {
    case JEWISHNESS_INITIAL_CHECKED: return caps.canInitialCheck
    case JEWISHNESS_FINAL_APPROVED:  return caps.canFinalApprove
    case 'rejected':                 return caps.canInitialCheck || caps.canFinalApprove
    case 'pending':
    case 'needs_review':
    case 'partial':                  return caps.hasAccess
    default:                         return false
  }
}

/** Прошла ли студентка финальное одобрение (ворота в кодеш). */
export function isKodeshJewishnessEligible(jewishnessStatus: string | null | undefined): boolean {
  return jewishnessStatus === JEWISHNESS_FINAL_APPROVED
}
