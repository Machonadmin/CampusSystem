// ─── Общие типы и хелперы вкладок модуля «Обучение» ──────────────────────────
//
// Вынесено из education/page.tsx при разбиении тяжёлой страницы на вкладки
// (Workstream 3b). Здесь только то, что переиспользуют несколько вкладок:
// типы строк, форматтеры и мелкий презентационный компонент ApplicantDetail.

export interface Lead {
  profile_id: string
  person_id: string
  full_name: string
  email: string | null
  phones: string[]
  photo_url: string | null
  referral_source: string | null
  application_date: string | null
  updated_at: string | null
  is_deleted: boolean
  recruitment_stage: 'interested' | 'in_process'
  interests: { free_text: string | null; direction_name: string | null; level_name: string | null; department_name: string | null }[]
  active_stages_with_tasks: { stage_name: string; tasks: string[] }[]
}

export type LeadSortKey = 'full_name' | 'application_date'
export type ProcessStatusFilter = 'active' | 'closed' | 'all' | 'deleted'

/** Строка из GET /api/education/journeys?status=applicant */
export interface ApplicantJourney {
  id: string
  application_date: string | null
  opened_at: string | null
  person: {
    full_name: string | null
    email: string | null
    phones: unknown
  } | null
  primary_department: { name: string } | null
  desired_department: { name: string } | null
  desired_specialty: { name: string } | null
  interests?: { free_text: string | null; direction_name: string | null; level_name: string | null; department_name: string | null }[]
  active_stages_with_tasks?: { stage_name: string; tasks: string[] }[]
}

type Interest = { free_text: string | null; direction_name: string | null; level_name: string | null; department_name: string | null }

export function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
}

export function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function interestLabel(i: Interest): string {
  if (i.direction_name) {
    const dir = i.level_name ? `${i.direction_name}, ${i.level_name}` : i.direction_name
    return i.department_name ? `${i.department_name} → ${dir}` : dir
  }
  return (i.free_text ?? '').trim()
}

// Пара «метка → значение» в раскрытой панели деталей строки.
export function ApplicantDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}
