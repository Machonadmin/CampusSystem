import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege, hasEducationPrivilege } from '@/lib/education/permissions'
import { getLessonAccess, getEnrolledJourneyIds } from '@/lib/education/lesson-access'
import { loadKodeshGroupIds, loadKodeshExemptions } from '@/lib/education/kodesh-exceptions'
import { isWithinAttendanceWindow } from '@/lib/education/attendance-window'
import type { AttendanceStatus, AttendanceInsert } from '@/types/database'

const VALID_STATUSES: readonly AttendanceStatus[] = ['present', 'late', 'absent']

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: serverT('invalid_id') }
  if (error.code === '23503') return { status: 400, message: serverT('invalid_reference') }
  if (error.code === '23514') return { status: 400, message: serverT('invalid_attendance_status') }
  return { status: 500, message: error.message ?? serverT('db_error') }
}

// Форма записи класса, записанного в группу (для отображения ростера).
type EnrollRow = {
  journey_id: string
  journey: {
    id: string
    person: { id: string; full_name: string | null; hebrew_name: string | null } | null
  } | null
}

/**
 * GET /api/education/lessons/[lessonId]/attendance
 * Посещаемость урока, наложенная на список студентов группы: каждый
 * записанный студент отдаётся со своим статусом или как не отмеченный (null).
 * Право: view_students в контексте группы урока.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { lessonId: string } }
) {
  try {
    const sb = createServerClient()

    const access = await getLessonAccess(sb, params.lessonId)
    if (!access) return apiError('lesson_not_found', 404)

    await requireEducationPrivilege('view_students', access.target)

    const classGroupId = access.lesson.class_group_id

    const [enrollsRes, attRes] = await Promise.all([
      sb.from('class_enrollments')
        .select(`
          journey_id,
          journey:education_journeys(
            id,
            person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name)
          )
        `)
        .eq('class_group_id', classGroupId),
      sb.from('attendance')
        .select('journey_id, status, marked_by, marked_at')
        .eq('lesson_id', params.lessonId),
    ])
    if (enrollsRes.error) throw enrollsRes.error
    if (attRes.error) throw attRes.error

    const statusByJourney = new Map<string, { status: AttendanceStatus; marked_by: string | null; marked_at: string | null }>()
    for (const row of attRes.data ?? []) {
      statusByJourney.set(row.journey_id, {
        status: row.status as AttendanceStatus,
        marked_by: row.marked_by,
        marked_at: row.marked_at,
      })
    }

    const enrolls = (enrollsRes.data ?? []) as unknown as EnrollRow[]
    const enrolledIdSet = new Set(enrolls.map(e => e.journey_id))
    const allStudents = enrolls.map(row => {
      const person = row.journey?.person ?? null
      const att = statusByJourney.get(row.journey_id) ?? null
      return {
        journey_id: row.journey_id,
        full_name: person?.full_name ?? null,
        hebrew_name: person?.hebrew_name ?? null,
        status: att?.status ?? null,
        marked_by: att?.marked_by ?? null,
        marked_at: att?.marked_at ?? null,
        is_guest: false,
      }
    })

    // חריגות קודש: на уроке кодеша освобождённых студенток не ждут в журнале —
    // на дату урока они выпадают из ростера (гости-разовые записи не трогаем).
    let students = allStudents
    const kodeshGroupIds = await loadKodeshGroupIds(sb)
    if (kodeshGroupIds.has(classGroupId)) {
      const exemptions = await loadKodeshExemptions(sb, allStudents.map(s => s.journey_id))
      if (exemptions.hasAny) {
        const dateISO = (access.lesson as unknown as { scheduled_date: string }).scheduled_date
        students = allStudents.filter(s => !exemptions.isExempt(s.journey_id, dateISO))
      }
    }

    // Разовые гости этого урока (lesson_roster_overrides) — journeys вне группы.
    // Деплой-безопасно: таблицы может ещё не быть (42P01) → просто без гостей.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ovr, error: ovrErr } = await (sb as any)
        .from('lesson_roster_overrides')
        .select('journey_id')
        .eq('lesson_id', params.lessonId)
      if (ovrErr) throw ovrErr
      const guestIds = [...new Set((ovr ?? []).map((r: { journey_id: string }) => r.journey_id))]
        .filter(id => !enrolledIdSet.has(id as string)) as string[]
      if (guestIds.length > 0) {
        const { data: gj } = await sb
          .from('education_journeys')
          .select('id, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name)')
          .in('id', guestIds)
        const nameById = new Map<string, { full_name: string | null; hebrew_name: string | null }>()
        for (const j of (gj ?? []) as unknown as Array<{ id: string; person: { full_name: string | null; hebrew_name: string | null } | null }>) {
          nameById.set(j.id, { full_name: j.person?.full_name ?? null, hebrew_name: j.person?.hebrew_name ?? null })
        }
        for (const gid of guestIds) {
          const att = statusByJourney.get(gid) ?? null
          const nm = nameById.get(gid)
          students.push({
            journey_id: gid,
            full_name: nm?.full_name ?? null,
            hebrew_name: nm?.hebrew_name ?? null,
            status: att?.status ?? null,
            marked_by: att?.marked_by ?? null,
            marked_at: att?.marked_at ?? null,
            is_guest: true,
          })
        }
      }
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code !== '42P01') throw e
    }

    return NextResponse.json({
      lesson_id: params.lessonId,
      class_group_id: classGroupId,
      students,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/**
 * POST /api/education/lessons/[lessonId]/attendance
 * Массовая отметка посещаемости. Право: mark_attendance в контексте группы урока.
 *
 * Body: { entries: { journey_id: string; status: 'present'|'late'|'absent' }[] }
 * Upsert по паре (lesson_id, journey_id); marked_by = текущий пользователь,
 * marked_at = сейчас. Каждый journey должен быть записан в группу урока.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { lessonId: string } }
) {
  try {
    const body = await request.json() as {
      entries?: { journey_id?: string; status?: string }[]
    }

    const entries = body.entries
    if (!Array.isArray(entries) || entries.length === 0) {
      return apiError('entries_required_nonempty', 400)
    }

    // Валидация каждой записи
    for (const entry of entries) {
      if (!entry.journey_id) {
        return apiError('entry_journey_id_required', 400)
      }
      if (!entry.status || !VALID_STATUSES.includes(entry.status as AttendanceStatus)) {
        return NextResponse.json(
          { error: `Недопустимый статус: ${entry.status ?? '(пусто)'}. Разрешено: ${VALID_STATUSES.join(', ')}` },
          { status: 400 }
        )
      }
    }

    const sb = createServerClient()

    const access = await getLessonAccess(sb, params.lessonId)
    if (!access) return apiError('lesson_not_found', 404)

    const session = await requireEducationPrivilege('mark_attendance', access.target)

    // Окно редактирования: руководитель (manage_students) правит всегда; учитель
    // — только во время урока + 30 мин (+ персональное доп. время из грантов).
    const isManager = await hasEducationPrivilege(session, 'manage_students', access.target)
    if (!isManager) {
      const lessonRow = access.lesson as unknown as { scheduled_date: string; scheduled_time: string | null; scheduled_end_time?: string | null }
      // Доп. время учителю: постоянное (lesson_id NULL) или разовое на этот урок.
      let extraMinutes = 0
      try {
        // Таблица teacher_attendance_grants ещё не в сгенерированных типах.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: grants } = await (sb as any)
          .from('teacher_attendance_grants')
          .select('extra_minutes, lesson_id')
          .eq('teacher_id', session.person_id)
        for (const g of (grants ?? []) as Array<{ extra_minutes: number; lesson_id: string | null }>) {
          if (g.lesson_id === null || g.lesson_id === params.lessonId) {
            extraMinutes = Math.max(extraMinutes, g.extra_minutes ?? 0)
          }
        }
      } catch { /* таблицы ещё нет — без доп. времени */ }

      const within = isWithinAttendanceWindow(new Date(), {
        scheduledDate: lessonRow.scheduled_date,
        scheduledTime: lessonRow.scheduled_time,
        scheduledEndTime: lessonRow.scheduled_end_time ?? null,
        extraMinutes,
      })
      if (!within) return apiError('attendance_window_closed', 403)
    }

    // Каждый journey должен быть записан в группу урока ИЛИ добавлен разовым
    // гостем именно на этот урок (lesson_roster_overrides).
    const enrolledIds = await getEnrolledJourneyIds(sb, access.lesson.class_group_id)
    const allowedIds = new Set(enrolledIds)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ovr, error: ovrErr } = await (sb as any)
        .from('lesson_roster_overrides')
        .select('journey_id')
        .eq('lesson_id', params.lessonId)
      if (ovrErr) throw ovrErr
      for (const r of (ovr ?? []) as Array<{ journey_id: string }>) allowedIds.add(r.journey_id)
    } catch (e) {
      if ((e as { code?: string }).code !== '42P01') throw e
    }
    const notAllowed = Array.from(new Set(entries.map(e => e.journey_id!)))
      .filter(id => !allowedIds.has(id))
    if (notAllowed.length > 0) {
      return NextResponse.json(
        { error: `Не записаны в группу урока: ${notAllowed.join(', ')}` },
        { status: 400 }
      )
    }

    // חריגות קודש: освобождённой студентке не пишем посещаемость на урок кодеша
    // в её период освобождения (её «отсутствие» не должно попадать в отчёты).
    let effectiveEntries = entries
    const kodeshGroupIds = await loadKodeshGroupIds(sb)
    if (kodeshGroupIds.has(access.lesson.class_group_id)) {
      const exemptions = await loadKodeshExemptions(sb, entries.map(e => e.journey_id!))
      if (exemptions.hasAny) {
        const dateISO = (access.lesson as unknown as { scheduled_date: string }).scheduled_date
        effectiveEntries = entries.filter(e => !exemptions.isExempt(e.journey_id!, dateISO))
      }
    }
    if (effectiveEntries.length === 0) {
      return NextResponse.json({ marked: 0 }, { status: 201 })
    }

    const markedAt = new Date().toISOString()
    const rows: AttendanceInsert[] = effectiveEntries.map(e => ({
      lesson_id: params.lessonId,
      journey_id: e.journey_id!,
      status: e.status as AttendanceStatus,
      marked_by: session.person_id,
      marked_at: markedAt,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await sb
      .from('attendance')
      .upsert(rows as any, { onConflict: 'lesson_id,journey_id' })
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json({ marked: rows.length }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
