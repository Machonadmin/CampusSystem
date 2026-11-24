// ─── «מרחב המנהל» — чистые правила (без БД, покрыты тестами) ─────────────────

export type DirectorSpaceRole = 'director' | 'secretary'

/**
 * Кто входит в «מרחב המנהל» (решение владельца 24.11.2026):
 *   • המנהל — роль superadmin;
 *   • מזכירת המנהל — ведёт календарь хотя бы одного superadmin
 *     (calendar_delegates или должность «מזכירת המנהל»).
 * Секретарь видит всё, что видит המנהל; утверждает — только в категориях,
 * которые ей откроет המנהל (следующий шаг).
 */
export function directorSpaceRole(a: {
  isSuperadmin: boolean
  managedOwnerIds: readonly string[]
  superadminIds: readonly string[]
}): DirectorSpaceRole | null {
  if (a.isSuperadmin) return 'director'
  const sa = new Set(a.superadminIds)
  return a.managedOwnerIds.some(id => sa.has(id)) ? 'secretary' : null
}

/**
 * Категории утверждений — ТОЛЬКО то, что уже существует в системе
 * (решение владельца: новых утверждений не добавлять). Порядок = порядок на экране.
 */
export const INBOX_CATEGORIES = [
  'teacher_course',     // утверждение преподавателя на курс (teacher_course_approvals)
  'schedule_slot',      // новый час в расписании (class_schedule_slots.approval_status)
  'discount',           // скидка на обучение (tuition_discount_approvals)
  'payment',            // платёж на подтверждение (finance_payments)
  'teacher_attendance', // отметка преподавателя (teacher_attendance + виртуальные)
  'jewishness_initial', // יהדות: ждёт первичной проверки
  'jewishness_final',   // יהדות: проверено, ждёт окончательного решения
  'meeting_request',    // заявка на встречу с המנהל (appointment_requests)
] as const
export type InboxCategory = typeof INBOX_CATEGORIES[number]

/** Сколько строк каждой категории отдаём на экран (число — всегда полное). */
export const INBOX_ITEMS_PER_CATEGORY = 50

/** Экран, где этот пункт решается сегодня. */
export function inboxHref(category: InboxCategory, ref: { journey_id?: string | null } = {}): string {
  switch (category) {
    case 'teacher_course': return '/dashboard/education/kodesh-rav'
    case 'schedule_slot': return '/dashboard/education/schedule-approvals'
    case 'discount': return '/dashboard/education/finance-admin'
    case 'payment': return ref.journey_id ? `/dashboard/finance/${ref.journey_id}` : '/dashboard/finance'
    case 'teacher_attendance': return '/dashboard/education/teacher-attendance'
    case 'jewishness_initial':
    case 'jewishness_final':
      return ref.journey_id ? `/dashboard/education/leads/${ref.journey_id}` : '/dashboard/jewishness'
    case 'meeting_request': return '/dashboard/meetings?tab=requests'
  }
}

/**
 * Две ступени יהדות (решение M16): статус остаётся «בבדיקה», пока нет решения;
 * первичная проверка рава — отметка jewishness_initial_checked_at.
 * Решено (verified/rejected) → не в очереди.
 */
export function jewishnessStep(status: unknown, initialCheckedAt: unknown): 'jewishness_initial' | 'jewishness_final' | null {
  const s = typeof status === 'string' ? status : null
  if (s === 'verified' || s === 'rejected') return null
  return initialCheckedAt ? 'jewishness_final' : 'jewishness_initial'
}
