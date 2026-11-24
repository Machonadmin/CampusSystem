import type { createServerClient } from '@/lib/supabase/server'
import { fetchAllPages } from '@/lib/api/handler'
import { isMissingColumn, isMissingTable } from '@/lib/supabase/errors'
import { chunks, lessonInfo, loadPendingTeacherAttendance } from '@/lib/education/teacher-attendance-pending'
import {
  INBOX_CATEGORIES, INBOX_ITEMS_PER_CATEGORY, inboxHref, jewishnessStep,
  type InboxCategory,
} from './rules'

// ─── «מרחב המנהל»: что ждёт утверждения (шаг 1 — только чтение) ──────────────
//
// Собирает в одну ленту ВСЁ, что уже сегодня ждёт утверждения на разных
// экранах. Условие «ждёт» в каждой категории — то же, что у исходного экрана:
//   teacher_course     — teacher_course_approvals.status = 'proposed'   (KodeshRavClient)
//   schedule_slot      — class_schedule_slots.approval_status = 'pending' (/api/education/schedule/approvals)
//   discount           — tuition_discount_approvals.status = 'pending'  (FinanceAdminClient)
//   payment            — finance_payments.status = 'pending'            (/api/finance/payments/[id]/approve)
//   teacher_attendance — очередь /api/education/teacher-attendance?scope=pending (без скоупа: המנהל видит всё)
//   jewishness_*       — education_journeys (applicant|student) без решения, как в /api/jewishness
//   meeting_request    — appointment_requests.status = 'pending' на календарь המנהל
// Здесь ничего не утверждается: кнопка ведёт на исходный экран.

type SB = ReturnType<typeof createServerClient>

export interface InboxItem {
  id: string
  category: InboxCategory
  /** О ком пункт (студентка / преподаватель / кто просит встречу). */
  who: string | null
  /** О чём: курс, группа, тема встречи. */
  what: string | null
  /** Кто подал / записал. */
  by: string | null
  /** Когда подано (ISO). */
  at: string | null
  href: string
  amount?: number | null
  percent?: number | null
  date?: string | null
  time?: string | null
  day_of_week?: number | null
  start_time?: string | null
  end_time?: string | null
  /** נוכחות מורה: для кнопок (виртуальная заявка решается через from-attendance). */
  lesson_id?: string | null
  teacher_person_id?: string | null
  virtual?: boolean
}

export interface InboxSection {
  category: InboxCategory
  total: number
  items: InboxItem[]
  /** Категорию не удалось загрузить — экран так и пишет, а не показывает «0». */
  failed: boolean
}

interface PersonLite { id: string; full_name: string | null; hebrew_name: string | null }
const nameOf = (p: Partial<PersonLite> | null | undefined) => (p ? ((p.hebrew_name || p.full_name || '').trim() || null) : null)

// Новые таблицы/колонки не во всех сгенерированных типах — как в остальных модулях.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const raw = (sb: SB): any => sb

async function namesOf(sb: SB, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = [...new Set(ids.filter((x): x is string => !!x))]
  for (const part of chunks(uniq)) {
    const { data } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', part)
    for (const p of (data ?? []) as PersonLite[]) {
      const n = nameOf(p)
      if (n) out.set(p.id, n)
    }
  }
  return out
}

/** Таблицы/колонки ещё нет (миграция не применена) — категория просто пустая. */
function notDeployed(e: unknown): boolean {
  return isMissingTable(e) || isMissingColumn(e)
}

const empty = (category: InboxCategory): InboxSection => ({ category, total: 0, items: [], failed: false })
const LIMIT = INBOX_ITEMS_PER_CATEGORY

async function teacherCourse(sb: SB): Promise<InboxSection> {
  const { data, error, count } = await raw(sb).from('teacher_course_approvals')
    .select('id, teacher_id, proposed_by, created_at, teacher:persons!teacher_course_approvals_teacher_id_fkey(full_name, hebrew_name), course:class_groups!teacher_course_approvals_course_group_id_fkey(name, name_he)', { count: 'exact' })
    .eq('status', 'proposed')
    .order('created_at', { ascending: true })
    .limit(LIMIT)
  if (error) { if (notDeployed(error)) return empty('teacher_course'); throw error }
  type Row = { id: string; proposed_by: string | null; created_at: string; teacher: PersonLite | null; course: { name: string | null; name_he: string | null } | null }
  const rows = (data ?? []) as Row[]
  const by = await namesOf(sb, rows.map(r => r.proposed_by))
  return {
    category: 'teacher_course', total: count ?? rows.length, failed: false,
    items: rows.map(r => ({
      id: r.id, category: 'teacher_course' as const,
      who: nameOf(r.teacher), what: (r.course?.name_he || r.course?.name || '').trim() || null,
      by: r.proposed_by ? (by.get(r.proposed_by) ?? null) : null, at: r.created_at,
      href: inboxHref('teacher_course'),
    })),
  }
}

async function scheduleSlot(sb: SB): Promise<InboxSection> {
  const { data, error, count } = await raw(sb).from('class_schedule_slots')
    .select('id, class_group_id, day_of_week, start_time, end_time, requested_by, created_at', { count: 'exact' })
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(LIMIT)
  if (error) { if (notDeployed(error)) return empty('schedule_slot'); throw error }
  type Row = { id: string; class_group_id: string; day_of_week: number; start_time: string | null; end_time: string | null; requested_by: string | null; created_at: string }
  const rows = (data ?? []) as Row[]
  const groups = new Map<string, string>()
  const gids = [...new Set(rows.map(r => r.class_group_id))]
  if (gids.length) {
    const { data: g } = await sb.from('class_groups').select('id, name').in('id', gids)
    for (const x of (g ?? []) as Array<{ id: string; name: string }>) groups.set(x.id, x.name)
  }
  const by = await namesOf(sb, rows.map(r => r.requested_by))
  return {
    category: 'schedule_slot', total: count ?? rows.length, failed: false,
    items: rows.map(r => ({
      id: r.id, category: 'schedule_slot' as const,
      who: null, what: groups.get(r.class_group_id) ?? null,
      by: r.requested_by ? (by.get(r.requested_by) ?? null) : null, at: r.created_at,
      day_of_week: r.day_of_week, start_time: r.start_time?.slice(0, 5) ?? null, end_time: r.end_time?.slice(0, 5) ?? null,
      href: inboxHref('schedule_slot'),
    })),
  }
}

async function discount(sb: SB): Promise<InboxSection> {
  const { data, error, count } = await raw(sb).from('tuition_discount_approvals')
    .select('id, journey_id, requested_percent, requested_by, created_at, journey:education_journeys!tuition_discount_approvals_journey_id_fkey(person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name))', { count: 'exact' })
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(LIMIT)
  if (error) { if (notDeployed(error)) return empty('discount'); throw error }
  type Row = { id: string; journey_id: string; requested_percent: number | null; requested_by: string | null; created_at: string; journey: { person: PersonLite | null } | null }
  const rows = (data ?? []) as Row[]
  const by = await namesOf(sb, rows.map(r => r.requested_by))
  return {
    category: 'discount', total: count ?? rows.length, failed: false,
    items: rows.map(r => ({
      id: r.id, category: 'discount' as const,
      who: nameOf(r.journey?.person), what: null,
      by: r.requested_by ? (by.get(r.requested_by) ?? null) : null, at: r.created_at,
      percent: r.requested_percent,
      href: inboxHref('discount', { journey_id: r.journey_id }),
    })),
  }
}

async function payment(sb: SB): Promise<InboxSection> {
  const { data, error, count } = await raw(sb).from('finance_payments')
    .select('id, journey_id, amount, paid_at, recorded_by, created_at, journey:education_journeys(person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name))', { count: 'exact' })
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(LIMIT)
  if (error) { if (notDeployed(error)) return empty('payment'); throw error }
  type Row = { id: string; journey_id: string; amount: number | string; paid_at: string | null; recorded_by: string | null; created_at: string; journey: { person: PersonLite | null } | null }
  const rows = (data ?? []) as Row[]
  const by = await namesOf(sb, rows.map(r => r.recorded_by))
  return {
    category: 'payment', total: count ?? rows.length, failed: false,
    items: rows.map(r => ({
      id: r.id, category: 'payment' as const,
      who: nameOf(r.journey?.person), what: null,
      by: r.recorded_by ? (by.get(r.recorded_by) ?? null) : null, at: r.created_at,
      amount: Number(r.amount), date: r.paid_at,
      href: inboxHref('payment', { journey_id: r.journey_id }),
    })),
  }
}

async function teacherAttendance(sb: SB): Promise<InboxSection> {
  let rows
  try {
    rows = await loadPendingTeacherAttendance(sb)
  } catch (e) {
    if (notDeployed(e)) return empty('teacher_attendance')
    throw e
  }
  const shown = rows.slice(0, LIMIT)
  const [info, names] = await Promise.all([
    lessonInfo(sb, shown.map(r => r.lesson_id)),
    namesOf(sb, shown.map(r => r.teacher_person_id)),
  ])
  return {
    category: 'teacher_attendance', total: rows.length, failed: false,
    items: shown.map(r => {
      const l = info.get(r.lesson_id) ?? null
      return {
        id: r.id, category: 'teacher_attendance' as const,
        who: names.get(r.teacher_person_id) ?? null, what: l?.group_name || null,
        by: null, at: r.reported_at,
        date: l?.date ?? null, time: l?.time ?? null,
        lesson_id: r.lesson_id, teacher_person_id: r.teacher_person_id, virtual: r.virtual,
        href: inboxHref('teacher_attendance'),
      }
    }),
  }
}

/** Обе ступени יהדות одним проходом (одна выборка — две категории). */
async function jewishness(sb: SB): Promise<[InboxSection, InboxSection]> {
  type Row = { id: string; created_at: string | null; jewishness_status: string | null; jewishness_initial_checked_at: string | null; person: PersonLite | null }
  let rows: Row[]
  try {
    rows = await fetchAllPages<Row>((from, to) => raw(sb)
      .from('education_journeys')
      .select('id, created_at, jewishness_status, jewishness_initial_checked_at, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
      .in('education_status', ['applicant', 'student'])
      .order('id', { ascending: true })
      .range(from, to))
  } catch (e) {
    if (notDeployed(e)) return [empty('jewishness_initial'), empty('jewishness_final')]
    throw e
  }
  const build = (category: 'jewishness_initial' | 'jewishness_final'): InboxSection => {
    const mine = rows
      .filter(r => jewishnessStep(r.jewishness_status, r.jewishness_initial_checked_at) === category)
      // Дольше всех ждут — сверху: первичная — по дате заявки, окончательная — по дате проверки.
      .sort((a, b) => ((category === 'jewishness_final' ? a.jewishness_initial_checked_at : a.created_at) ?? '')
        .localeCompare((category === 'jewishness_final' ? b.jewishness_initial_checked_at : b.created_at) ?? ''))
    return {
      category, total: mine.length, failed: false,
      items: mine.slice(0, LIMIT).map(r => ({
        id: r.id, category,
        who: nameOf(r.person), what: null, by: null,
        at: category === 'jewishness_final' ? r.jewishness_initial_checked_at : r.created_at,
        href: inboxHref(category, { journey_id: r.id }),
      })),
    }
  }
  return [build('jewishness_initial'), build('jewishness_final')]
}

async function meetingRequest(sb: SB, directorIds: string[]): Promise<InboxSection> {
  if (directorIds.length === 0) return empty('meeting_request')
  const { data, error, count } = await raw(sb).from('appointment_requests')
    .select('id, owner_id, requester_id, subject, created_at', { count: 'exact' })
    .eq('status', 'pending')
    .in('owner_id', directorIds)
    .order('created_at', { ascending: true })
    .limit(LIMIT)
  if (error) { if (notDeployed(error)) return empty('meeting_request'); throw error }
  type Row = { id: string; owner_id: string; requester_id: string; subject: string; created_at: string }
  const rows = (data ?? []) as Row[]
  const names = await namesOf(sb, rows.map(r => r.requester_id))
  return {
    category: 'meeting_request', total: count ?? rows.length, failed: false,
    items: rows.map(r => ({
      id: r.id, category: 'meeting_request' as const,
      who: names.get(r.requester_id) ?? null, what: r.subject, by: null, at: r.created_at,
      href: inboxHref('meeting_request'),
    })),
  }
}

/** Одна упавшая категория не роняет всю ленту: она помечается failed. */
async function safe<T>(category: InboxCategory | InboxCategory[], fn: () => Promise<T>): Promise<T | InboxSection[]> {
  try {
    return await fn()
  } catch (e) {
    console.error('[director-inbox]', category, (e as { message?: string })?.message ?? e)
    const cats = Array.isArray(category) ? category : [category]
    return cats.map(c => ({ category: c, total: 0, items: [], failed: true }))
  }
}

export async function loadDirectorInbox(sb: SB, directorIds: string[]): Promise<InboxSection[]> {
  const parts = await Promise.all([
    safe('teacher_course', () => teacherCourse(sb)),
    safe('schedule_slot', () => scheduleSlot(sb)),
    safe('discount', () => discount(sb)),
    safe('payment', () => payment(sb)),
    safe('teacher_attendance', () => teacherAttendance(sb)),
    safe(['jewishness_initial', 'jewishness_final'], () => jewishness(sb)),
    safe('meeting_request', () => meetingRequest(sb, directorIds)),
  ])
  const flat = parts.flatMap(p => (Array.isArray(p) ? p : [p])) as InboxSection[]
  const byCat = new Map(flat.map(s => [s.category, s]))
  return INBOX_CATEGORIES.map(c => byCat.get(c) ?? empty(c))
}
