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

// ─── Шаг 2: утвердить / отклонить прямо из ленты ─────────────────────────────
//
// Кнопки вызывают ТЕ ЖЕ маршруты, что и исходные экраны, — значит, и те же
// проверки прав: что запрещено там, запрещено и здесь. Своей логики решения у
// ленты нет. Где решение требует больше, чем одна кнопка, кнопки нет — только
// «פתח»:
//   • teacher_course — у рава три исхода (в т.ч. «запросить информацию»);
//   • jewishness_*   — документы и заметка, две ступени с разными правами;
//   • meeting_request «утвердить» — нужно выбрать время встречи;
//   • payment «отклонить» — в финансах это «отмена» платежа, другое право.

export interface InboxAction {
  url: string
  method: 'POST' | 'PATCH'
  body: Record<string, unknown>
}

export interface InboxActionRef {
  category: InboxCategory
  id: string
  lesson_id?: string | null
  teacher_person_id?: string | null
  virtual?: boolean
}

export function inboxActions(it: InboxActionRef): { approve: InboxAction | null; reject: InboxAction | null } {
  const id = encodeURIComponent(it.id)
  switch (it.category) {
    case 'schedule_slot': {
      const url = `/api/education/schedule/slots/${id}/decision`
      return {
        approve: { url, method: 'POST', body: { decision: 'approve' } },
        reject: { url, method: 'POST', body: { decision: 'reject' } },
      }
    }
    case 'discount': {
      const url = `/api/finance/discount-approvals/${id}`
      return {
        approve: { url, method: 'PATCH', body: { status: 'approved' } },
        reject: { url, method: 'PATCH', body: { status: 'rejected' } },
      }
    }
    case 'payment':
      return { approve: { url: `/api/finance/payments/${id}/approve`, method: 'POST', body: {} }, reject: null }
    case 'teacher_attendance': {
      if (it.virtual) {
        if (!it.lesson_id || !it.teacher_person_id) return { approve: null, reject: null }
        const url = '/api/education/teacher-attendance/from-attendance'
        const base = { lesson_id: it.lesson_id, teacher_person_id: it.teacher_person_id }
        return {
          approve: { url, method: 'POST', body: { ...base, decision: 'approved' } },
          reject: { url, method: 'POST', body: { ...base, decision: 'rejected' } },
        }
      }
      const url = `/api/education/teacher-attendance/${id}`
      return {
        approve: { url, method: 'PATCH', body: { decision: 'approved' } },
        reject: { url, method: 'PATCH', body: { decision: 'rejected' } },
      }
    }
    case 'meeting_request':
      return { approve: null, reject: { url: `/api/meetings/requests/${id}`, method: 'PATCH', body: { action: 'decline' } } }
    default:
      return { approve: null, reject: null }
  }
}

// ─── Шаг 3: המנהל открывает секретарю утверждение по категориям ──────────────
//
// Решение владельца 24.11.2026 («הרשאות צרות»): переключатель выдаёт УЗКОЕ
// право, которое открывает только само утверждение — тот же person_privileges,
// что на экране «אבטחת מידע» (там его видно и там же можно снять):
//   schedule_slot      → studies.approve_schedule_slots   (новое)
//   discount           → finance.approve_discount         (уже узкое)
//   payment            → finance.confirm_payment          (было не подключено; теперь — только подтверждение платежа)
//   teacher_attendance → studies.approve_teacher_attendance (новое)
// meeting_request секретарь ведёт и так; teacher_course и יהדות — без кнопок в ленте.

export const SECRETARY_GRANTS = {
  schedule_slot: { module: 'studies', privilege_code: 'approve_schedule_slots' },
  discount: { module: 'finance', privilege_code: 'approve_discount' },
  payment: { module: 'finance', privilege_code: 'confirm_payment' },
  teacher_attendance: { module: 'studies', privilege_code: 'approve_teacher_attendance' },
} as const satisfies Partial<Record<InboxCategory, { module: string; privilege_code: string }>>

export type SecretaryGrantCategory = keyof typeof SECRETARY_GRANTS
export const SECRETARY_GRANT_CATEGORIES = Object.keys(SECRETARY_GRANTS) as SecretaryGrantCategory[]

export function isSecretaryGrantCategory(v: unknown): v is SecretaryGrantCategory {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(SECRETARY_GRANTS, v)
}

/** Личная строка считается выданной: is_granted и срок не истёк. */
export function isActiveGrant(row: { is_granted: boolean; expires_at: string | null }, nowIso: string): boolean {
  return row.is_granted && (row.expires_at === null || row.expires_at > nowIso)
}
