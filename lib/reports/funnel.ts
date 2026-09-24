// ─── Воронка приёма — ЕДИНЫЙ источник расчёта ────────────────────────────────
//
// Чистые функции (без БД). Используются и «דוחות» (/api/reports/admission-funnel),
// и дашбордом набора (/api/education/recruitment-report) через серверный
// загрузчик loadAdmissionFunnel (lib/reports/metrics.ts) — чтобы одно и то же
// число было одинаковым на обоих экранах.
//
// Конверсия оценивается по текущему срезу education_status: статус кумулятивен
// (студентка когда-то была лидом), поэтому «дошли до абитуриентки/студентки»
// считаются как все, кто на этом статусе ИЛИ дальше.

/** education_status, которые «дошли» дальше лида. */
export const BEYOND_LEAD = ['applicant', 'student', 'on_leave', 'graduated', 'expelled'] as const
/** education_status, которые «дошли» дальше абитуриентки. */
export const BEYOND_APPLICANT = ['student', 'on_leave', 'graduated', 'expelled'] as const

/** Процент с одним знаком после запятой; whole ≤ 0 → 0 (без деления на ноль). */
export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

export interface AdmissionFunnel {
  by_status: Record<string, number>
  funnel: {
    leads: number
    applicants: number
    students: number
    reached_applicant: number
    reached_student: number
  }
  conversion: {
    lead_to_applicant: number
    applicant_to_student: number
  }
}

/**
 * Воронка из строк education_journeys (уже без soft-deleted — фильтр делает
 * загрузчик). Пустой/неизвестный статус (null) считается как 'unknown'.
 */
export function admissionFunnel(
  journeys: { education_status: string | null }[],
): AdmissionFunnel {
  const by_status: Record<string, number> = {}
  for (const j of journeys) {
    const s = j.education_status ?? 'unknown'
    by_status[s] = (by_status[s] ?? 0) + 1
  }
  const leads = by_status['lead'] ?? 0
  const reachedApplicant = BEYOND_LEAD.reduce((s, k) => s + (by_status[k] ?? 0), 0)
  const reachedStudent = BEYOND_APPLICANT.reduce((s, k) => s + (by_status[k] ?? 0), 0)
  const everLead = leads + reachedApplicant
  return {
    by_status,
    funnel: {
      leads,
      applicants: by_status['applicant'] ?? 0,
      students: by_status['student'] ?? 0,
      reached_applicant: reachedApplicant,
      reached_student: reachedStudent,
    },
    conversion: {
      lead_to_applicant: pct(reachedApplicant, everLead),
      applicant_to_student: pct(reachedStudent, reachedApplicant),
    },
  }
}
