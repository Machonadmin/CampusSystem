import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, errorResponse } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { canDoEducationInAny, hasEducationPrivilege } from '@/lib/education/permissions'
import { isMissingTable } from '@/lib/supabase/errors'
import { getCookieLocale } from '@/lib/i18n/locale'
import { localizedDeptName } from '@/lib/departments/localized-name'
import { getTaskAccess } from '@/lib/tasks/access'
import { mapDbError } from '@/lib/tasks/helpers'
import { isUuid } from '@/lib/tasks/student-tag'
import {
  CLOSED_TASK_STATUSES_FILTER,
  type OpenAbsenceItem,
  type OpenAlertItem,
  type OpenMeetingItem,
  type OpenTaskItem,
  type StudentOpenItems,
} from '@/lib/students/open-items'
import type { SessionPayload } from '@/lib/auth/jwt'
import type { TaskRow } from '@/types/database'
import { getAbsencePrivilegeScope, filterVisibleAbsences } from '@/lib/education/absence-access'
import { getAlertStudentScope } from '@/lib/education/alert-scope'

type Sb = ReturnType<typeof createServerClient>

// ─── Открытые оповещения ─────────────────────────────────────────────────────
// Право — то же, что у GET /api/education/alerts: view_students (где угодно)
// ИЛИ manage_alerts. Чувствительные строки — только с view_sensitive_alerts.
// Нет права → пустой список (панель всё равно рисуется).
async function loadAlerts(sb: Sb, session: SessionPayload, personId: string): Promise<OpenAlertItem[]> {
  const allowed = (await canDoEducationInAny(session, 'view_students'))
    || (await hasEducationPrivilege(session, 'manage_alerts'))
  if (!allowed) return []
  const studentScope = await getAlertStudentScope(sb, session)
  if (studentScope && !studentScope.has(personId)) return []
  const seeSensitive = await hasEducationPrivilege(session, 'view_sensitive_alerts')

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (sb.from('student_alerts') as any)
      .select('id, type_code, severity, title, state, is_sensitive, created_at')
      .eq('student_id', personId)
      .neq('state', 'closed')
      .order('created_at', { ascending: false })
    if (!seeSensitive) q = q.eq('is_sensitive', false)
    const { data, error } = await q
    if (error) throw error
    const rows = (data ?? []) as Array<{
      id: string; type_code: string | null; severity: string; title: string | null
      state: string; is_sensitive: boolean; created_at: string
    }>

    // Названия типов — одним запросом (для чипа/строки в панели).
    const codes = [...new Set(rows.map(r => r.type_code).filter(Boolean))] as string[]
    const typeByCode = new Map<string, { name_he: string | null; name_ru: string | null; name_en: string | null }>()
    if (codes.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: types, error: tErr } = await (sb.from('student_alert_types') as any)
        .select('code, name_he, name_ru, name_en')
        .in('code', codes)
      if (tErr) console.error('[open-items] alert types:', tErr)
      for (const ty of (types ?? []) as Array<{ code: string; name_he: string | null; name_ru: string | null; name_en: string | null }>) {
        typeByCode.set(ty.code, ty)
      }
    }

    return rows.map(r => {
      const ty = r.type_code ? typeByCode.get(r.type_code) : undefined
      return {
        id: r.id,
        type_code: r.type_code,
        type_name_he: ty?.name_he ?? null,
        type_name_ru: ty?.name_ru ?? null,
        type_name_en: ty?.name_en ?? null,
        severity: r.severity,
        title: r.title,
        state: r.state,
        created_at: r.created_at,
      }
    })
  } catch (e) {
    if (isMissingTable(e)) return []
    throw e
  }
}

// ─── Незакрытые случаи отсутствия ────────────────────────────────────────────
// Та же видимость, что у GET /api/education/absences: менеджер (superadmin или
// manage_students) видит все, остальные — только переданные своим подразделениям.
async function loadAbsences(sb: Sb, session: SessionPayload, journeyId: string): Promise<OpenAbsenceItem[]> {
  const access = await getAbsencePrivilegeScope(session)
  if (!access.all && access.depts.length === 0) return []

  try {
    let q = sb
      .from('absence_cases')
      .select('id, absence_date, note, status, assigned_department_id, opened_at')
      .eq('journey_id', journeyId)
      .neq('status', 'resolved')
      .order('opened_at', { ascending: false })
    if (!access.all && !access.deptManager) q = q.in('assigned_department_id', access.depts)
    const { data, error } = await q
    if (error) throw error
    const rows = await filterVisibleAbsences(sb, access, ((data ?? []) as Array<{
      id: string; absence_date: string | null; note: string | null; status: string
      assigned_department_id: string | null; opened_at: string
    }>).map(r => ({ ...r, journey_id: journeyId })))

    const deptIds = [...new Set(rows.map(r => r.assigned_department_id).filter(Boolean))] as string[]
    const deptName = new Map<string, string>()
    if (deptIds.length > 0) {
      const { data: ds, error: dErr } = await sb.from('departments').select('id, name, name_he, name_en').in('id', deptIds)
      if (dErr) console.error('[open-items] departments:', dErr)
      const lang = getCookieLocale()
      for (const d of (ds ?? []) as Array<{ id: string; name: string; name_he: string | null; name_en: string | null }>) deptName.set(d.id, localizedDeptName(d, lang))
    }

    return rows.map(r => ({
      id: r.id,
      absence_date: r.absence_date,
      note: r.note,
      status: r.status,
      department_name: r.assigned_department_id ? (deptName.get(r.assigned_department_id) ?? null) : null,
      opened_at: r.opened_at,
    }))
  } catch (e) {
    if (isMissingTable(e)) return []
    throw e
  }
}

// ─── Открытые задачи с меткой этой תלמידה ────────────────────────────────────
// Поиск по tasks.metadata.journey_id (тот же ключ, что у автозадач приёмки —
// они тоже относятся к этой תלמידה и попадают сюда). Каждую строку фильтруем
// через getTaskAccess(...).canView: задачи, которые смотрящий не может открыть,
// не показываются и НЕ считаются (решение владельца).
async function loadTasks(sb: Sb, session: SessionPayload, journeyId: string): Promise<OpenTaskItem[]> {
  const { data, error } = await sb
    .from('tasks')
    .select('*, assignee:persons!tasks_assignee_id_fkey(id, full_name, hebrew_name)')
    .contains('metadata', { journey_id: journeyId })
    .not('status', 'in', CLOSED_TASK_STATUSES_FILTER)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error

  const rows = (data ?? []) as unknown as Array<TaskRow & {
    assignee: { full_name: string | null; hebrew_name: string | null } | null
  }>
  const out: OpenTaskItem[] = []
  for (const row of rows) {
    const access = await getTaskAccess(row, session.person_id, session.roles ?? [], session)
    if (!access.canView) continue
    out.push({
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      due_date: row.due_date,
      assignee_name: row.assignee ? ((row.assignee.hebrew_name || row.assignee.full_name || '').trim() || null) : null,
    })
  }
  return out
}

// ─── Предстоящие встречи смотрящего с этой תלמידה ───────────────────────────
// Только встречи, где смотрящий сам ведущий (provider_id) или участник, а
// תלמידה — тема встречи (journey_id) или тоже участница. Чужие встречи не
// показываются вовсе, поэтому отдельного права не нужно: свою встречу он и так
// видит в календаре. Отменённые и прошедшие — не попадают.
async function loadMeetings(
  sb: Sb, session: SessionPayload, journeyId: string, personId: string,
): Promise<OpenMeetingItem[]> {
  const me = session.person_id
  if (!me) return []
  try {
    const nowIso = new Date().toISOString()
    // Встречи, где она участница.
    const { data: herRows, error: hErr } = await sb
      .from('appointment_attendees')
      .select('appointment_id')
      .eq('person_id', personId)
    if (hErr) throw hErr
    const herIds = new Set(((herRows ?? []) as Array<{ appointment_id: string }>).map(r => r.appointment_id))

    // Встречи, где я участник.
    const { data: myRows, error: mErr } = await sb
      .from('appointment_attendees')
      .select('appointment_id')
      .eq('person_id', me)
    if (mErr) throw mErr
    const myIds = new Set(((myRows ?? []) as Array<{ appointment_id: string }>).map(r => r.appointment_id))

    // Кандидаты: о ней (journey_id) или с ней (участница). Дальше — только мои.
    const orParts = [`journey_id.eq.${journeyId}`]
    if (herIds.size > 0) orParts.push(`id.in.(${[...herIds].join(',')})`)
    const { data, error } = await sb
      .from('appointments')
      .select('id, title, starts_at, provider_id')
      .or(orParts.join(','))
      .eq('status', 'scheduled')
      .gte('starts_at', nowIso)
      .order('starts_at', { ascending: true })
      .limit(50)
    if (error) throw error
    return ((data ?? []) as Array<{ id: string; title: string | null; starts_at: string; provider_id: string }>)
      .filter(a => a.provider_id === me || myIds.has(a.id))
      .map(a => ({ id: a.id, title: a.title, starts_at: a.starts_at }))
  } catch (e) {
    if (isMissingTable(e)) return []
    throw e
  }
}

/**
 * GET /api/students/[id]/open-items   ([id] = education_journeys.id)
 *
 * «פתוח עכשיו» на карточке תלמידה: { alerts, absence_cases, tasks, meetings }. Только
 * чтение. Каждый раздел гейтится своим правом (см. загрузчики выше); раздел без
 * права — пустой список, не ошибка.
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await requireAuth()
    // Портальный токен תלמידה — не сюда (это рабочий экран сотрудника).
    if (session.principal === 'student') return apiError('forbidden', 403)
    if (!isUuid(params.id)) return apiError('student_not_found', 404)

    const sb = createServerClient()
    const { data: journey, error: jErr } = await sb
      .from('education_journeys')
      .select('id, person_id')
      .eq('id', params.id)
      .maybeSingle()
    if (jErr) throw jErr
    if (!journey) return apiError('student_not_found', 404)
    const j = journey as { id: string; person_id: string }

    const [alerts, absence_cases, tasks, meetings] = await Promise.all([
      loadAlerts(sb, session, j.person_id),
      loadAbsences(sb, session, j.id),
      loadTasks(sb, session, j.id),
      loadMeetings(sb, session, j.id, j.person_id),
    ])

    const result: StudentOpenItems = { person_id: j.person_id, alerts, absence_cases, tasks, meetings }
    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return errorResponse(m)
    }
    return errorResponse(e)
  }
}
