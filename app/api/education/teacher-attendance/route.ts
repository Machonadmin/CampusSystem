import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny, getEducationPrivilegeScope, getUserDepartmentIds } from '@/lib/education/permissions'
import { isMissingTable } from '@/lib/supabase/errors'
import { errorResponse, fetchAllPages } from '@/lib/api/handler'
import { attendanceMarkerFallback, lessonsWithMultipleReports } from '@/lib/education/teacher-hours'

/** .in() по длинному списку id режем на куски (длина URL PostgREST). */
const IN_CHUNK = 150
function chunks<T>(arr: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Окно виртуальных заявок «через посещаемость»: с 1-го числа позапрошлого месяца по сегодня. */
function virtualWindow(today = new Date()): { from: string; to: string } {
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1)).toISOString().slice(0, 10)
  return { from, to: today.toISOString().slice(0, 10) }
}

/**
 * Нокхут морим (נוכחות מורים).
 *   GET ?scope=mine    → мои отметки (учитель): урок + статус.
 *   GET ?scope=lessons → мои уроки (class_teacher) + уроки, где я замещала
 *                        (отметила посещаемость учениц или уже отметилась).
 *   GET ?scope=pending → на подтверждение (секретариат: manage_students/superadmin).
 *                        Кроме реальных отметок — ВИРТУАЛЬНЫЕ заявки «דווח דרך
 *                        נוכחות תלמידות» (урок без отметки преподавателя, но с
 *                        посещаемостью учениц → тому, кто её отметил); пометка
 *                        two_teachers — по уроку отметились два преподавателя.
 *   POST { lesson_id } → сотрудник отмечает «пришёл» на урок. Решение владельца
 *                        #5: замещающая может отметиться, даже если она не в
 *                        class_teachers группы (только сотрудники, не ученицы).
 * Деплой-безопасно (42P01 → пусто/503).
 */


/** lesson_id → department_id (через class_group). Для скоупинга очереди по подразделению. */
async function lessonDepartments(sb: ReturnType<typeof createServerClient>, lessonIds: string[]) {
  const byLesson = new Map<string, string | null>()
  const ids = [...new Set(lessonIds.filter(Boolean))]
  if (ids.length === 0) return byLesson
  for (const part of chunks(ids)) {
    const { data: lessons } = await sb.from('lessons')
      .select('id, class_group:class_groups(department_id)').in('id', part)
    for (const l of (lessons ?? []) as unknown as Array<{ id: string; class_group: { department_id: string | null } | null }>) {
      byLesson.set(l.id, l.class_group?.department_id ?? null)
    }
  }
  return byLesson
}

async function lessonInfo(sb: ReturnType<typeof createServerClient>, lessonIds: string[]) {
  const byId = new Map<string, { date: string | null; time: string | null; group_name: string; subject: string | null }>()
  const ids = [...new Set(lessonIds.filter(Boolean))]
  if (ids.length === 0) return byId
  for (const part of chunks(ids)) {
    const { data: lessons } = await sb.from('lessons')
      .select('id, scheduled_date, scheduled_time, class_group:class_groups(name, subject:subjects(name))')
      .in('id', part)
    for (const l of (lessons ?? []) as unknown as Array<{ id: string; scheduled_date: string | null; scheduled_time: string | null; class_group: { name: string; subject: { name: string } | null } | null }>) {
      byId.set(l.id, {
        date: l.scheduled_date, time: l.scheduled_time?.slice(0, 5) ?? null,
        group_name: l.class_group?.name ?? '', subject: l.class_group?.subject?.name ?? null,
      })
    }
  }
  return byId
}

type PendingItem = {
  id: string
  lesson_id: string
  teacher_person_id: string
  status: string
  note: string | null
  reported_at: string | null
  /** Виртуальная заявка (строки teacher_attendance ещё нет) — решается через /from-attendance. */
  virtual: boolean
  /** «דווח דרך נוכחות תלמידות»: кандидат — тот, кто отметил посещаемость учениц. */
  via_student_attendance: boolean
  /** «שני מורים דיווחו»: по уроку отметились два и более преподавателя. */
  two_teachers: boolean
}

/** Все отметки преподавателей (любой статус) по урокам — для пометки «два преподавателя». */
async function reportsForLessons(sb: ReturnType<typeof createServerClient>, lessonIds: string[]) {
  const out: Array<{ lesson_id: string; teacher_person_id: string; status: string }> = []
  for (const part of chunks([...new Set(lessonIds.filter(Boolean))])) {
    const { data, error } = await sb.from('teacher_attendance')
      .select('lesson_id, teacher_person_id, status').in('lesson_id', part)
    if (error) throw error
    out.push(...((data ?? []) as typeof out))
  }
  return out
}

/**
 * Виртуальные заявки (решение #5, правило 2): неотменённые уроки окна
 * virtualWindow(), где есть посещаемость учениц, но НЕТ ни одной отметки
 * преподавателя → заявка на того, кто отметил посещаемость (attendance.marked_by).
 * В БД ничего не пишется, пока секретариат не решит (POST /from-attendance).
 */
async function virtualMarkerItems(sb: ReturnType<typeof createServerClient>): Promise<PendingItem[]> {
  const { from, to } = virtualWindow()
  const lessons = await fetchAllPages<{ id: string; is_cancelled: boolean | null }>((f, t) => sb.from('lessons')
    .select('id, is_cancelled').gte('scheduled_date', from).lte('scheduled_date', to)
    .order('id', { ascending: true }).range(f, t))
  const live = lessons.filter(l => !l.is_cancelled).map(l => l.id)
  if (live.length === 0) return []
  const marks: Array<{ lesson_id: string; marked_by: string | null }> = []
  for (const part of chunks(live)) {
    marks.push(...await fetchAllPages<{ lesson_id: string; marked_by: string | null }>((f, t) => sb.from('attendance')
      .select('id, lesson_id, marked_by').in('lesson_id', part).not('marked_by', 'is', null)
      .order('id', { ascending: true }).range(f, t)))
  }
  const reports = await reportsForLessons(sb, marks.map(m => m.lesson_id))
  return attendanceMarkerFallback(marks, reports).map(v => ({
    id: `virtual:${v.lesson_id}:${v.teacher_person_id}`,
    lesson_id: v.lesson_id, teacher_person_id: v.teacher_person_id,
    status: 'reported', note: null, reported_at: null,
    virtual: true, via_student_attendance: true, two_teachers: false,
  }))
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const sb = createServerClient()
    const scope = request.nextUrl.searchParams.get('scope') ?? 'mine'

    if (scope === 'pending') {
      const canApprove = session.roles.includes('superadmin') || await canDoEducationInAny(session, 'manage_students')
      if (!canApprove) return apiError('forbidden', 403)
      try {
        const { data, error } = await sb.from('teacher_attendance')
          .select('id, lesson_id, teacher_person_id, status, note, reported_at')
          .eq('status', 'reported')
          .order('reported_at', { ascending: true })
        if (error) throw error
        const real = (data ?? []) as Array<{ id: string; lesson_id: string; teacher_person_id: string; status: string; note: string | null; reported_at: string }>
        let rows: PendingItem[] = real.map(r => ({ ...r, virtual: false, via_student_attendance: false, two_teachers: false }))

        // Решение #5, правило 2: урок без отметки преподавателя, но с
        // посещаемостью учениц → виртуальная заявка тому, кто отметил посещаемость.
        rows.push(...await virtualMarkerItems(sb))

        // Решение #5, правило 4: по уроку отметились два преподавателя → пометка.
        const multi = lessonsWithMultipleReports(await reportsForLessons(sb, rows.map(r => r.lesson_id)))
        for (const r of rows) r.two_teachers = multi.has(r.lesson_id)

        // Скоуп очереди по подразделению (решение владельца: «רק המחלקה שלו»).
        // scope='all'/superadmin — вся очередь; иначе только уроки подразделений
        // менеджера. Урок без подразделения виден лишь при scope='all'.
        const scopeAll = session.roles.includes('superadmin')
          || (await getEducationPrivilegeScope(session, 'manage_students')) === 'all'
        if (!scopeAll) {
          const myDepts = new Set(await getUserDepartmentIds(session.person_id))
          const deptByLesson = await lessonDepartments(sb, rows.map(r => r.lesson_id))
          rows = rows.filter(r => {
            const d = deptByLesson.get(r.lesson_id) ?? null
            return d !== null && myDepts.has(d)
          })
        }

        const info = await lessonInfo(sb, rows.map(r => r.lesson_id))
        const names = new Map<string, string>()
        const tids = [...new Set(rows.map(r => r.teacher_person_id))]
        for (const part of chunks(tids)) {
          const { data: ps } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', part)
          for (const p of (ps ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) names.set(p.id, (p.hebrew_name || p.full_name || '').trim())
        }
        // Реальные — по времени отметки; виртуальные — следом, по дате урока.
        const items = rows.map(r => ({ ...r, teacher_name: names.get(r.teacher_person_id) ?? '', lesson: info.get(r.lesson_id) ?? null }))
        items.sort((a, b) => (a.virtual === b.virtual ? 0 : a.virtual ? 1 : -1)
          || (a.virtual ? (a.lesson?.date ?? '').localeCompare(b.lesson?.date ?? '') : 0))
        return NextResponse.json({ items })
      } catch (e) {
        if (isMissingTable(e)) return NextResponse.json({ items: [] })
        throw e
      }
    }

    if (scope === 'lessons') {
      // Мои уроки (как преподаватель) за окно [−21д, +7д] + статус отметки, если есть.
      // Учитель выбирает урок и жмёт «я был» прямо в этом списке.
      // Решение #5, правило 3: плюс уроки, где я ЗАМЕЩАЛА (не числюсь в
      // class_teachers, но отметила посещаемость учениц или уже отметилась сама).
      const { data: ct } = await sb.from('class_teachers').select('class_group_id').eq('teacher_id', session.person_id)
      const groupIds = [...new Set((ct ?? []).map(r => (r as { class_group_id: string }).class_group_id))]
      const today = new Date()
      const from = new Date(today.getTime() - 21 * 86400000).toISOString().slice(0, 10)
      const to = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10)
      type LRow = { id: string; scheduled_date: string | null; scheduled_time: string | null; is_cancelled: boolean; class_group: { name: string; subject: { name: string; name_he: string | null } | null } | null }
      const LSELECT = 'id, scheduled_date, scheduled_time, is_cancelled, class_group:class_groups(name, subject:subjects(name, name_he))'
      const byId = new Map<string, LRow>()
      if (groupIds.length > 0) {
        const { data: lessons } = await sb.from('lessons')
          .select(LSELECT)
          .in('class_group_id', groupIds)
          .gte('scheduled_date', from).lte('scheduled_date', to)
        for (const l of (lessons ?? []) as unknown as LRow[]) byId.set(l.id, l)
      }
      const extraIds = new Set<string>()
      {
        const marked = await fetchAllPages<{ lesson_id: string }>((f, t) => sb.from('attendance')
          .select('id, lesson_id, lesson:lessons!inner(scheduled_date)')
          .eq('marked_by', session.person_id)
          .gte('lesson.scheduled_date', from).lte('lesson.scheduled_date', to)
          .order('id', { ascending: true }).range(f, t))
        for (const m of marked) if (!byId.has(m.lesson_id)) extraIds.add(m.lesson_id)
      }
      try {
        const { data: own, error: ownErr } = await sb.from('teacher_attendance')
          .select('lesson_id, lesson:lessons!inner(scheduled_date)')
          .eq('teacher_person_id', session.person_id)
          .gte('lesson.scheduled_date', from).lte('lesson.scheduled_date', to)
        if (ownErr) throw ownErr
        for (const o of (own ?? []) as Array<{ lesson_id: string }>) if (!byId.has(o.lesson_id)) extraIds.add(o.lesson_id)
      } catch (e) {
        if (!isMissingTable(e)) throw e
      }
      for (const part of chunks([...extraIds])) {
        const { data: lessons } = await sb.from('lessons').select(LSELECT).in('id', part)
        for (const l of (lessons ?? []) as unknown as LRow[]) byId.set(l.id, l)
      }
      if (byId.size === 0) return NextResponse.json({ items: [] })
      const lrows = [...byId.values()].sort((a, b) =>
        (b.scheduled_date ?? '').localeCompare(a.scheduled_date ?? '') || (b.scheduled_time ?? '').localeCompare(a.scheduled_time ?? ''))
      const statusByLesson = new Map<string, { id: string; status: string }>()
      try {
        for (const part of chunks(lrows.map(l => l.id))) {
          const { data: att } = await sb.from('teacher_attendance')
            .select('id, lesson_id, status').eq('teacher_person_id', session.person_id).in('lesson_id', part)
          for (const a of (att ?? []) as Array<{ id: string; lesson_id: string; status: string }>) statusByLesson.set(a.lesson_id, { id: a.id, status: a.status })
        }
      } catch (e) {
        if (!isMissingTable(e)) throw e
      }
      return NextResponse.json({ items: lrows.filter(l => !l.is_cancelled).map(l => {
        const a = statusByLesson.get(l.id)
        return {
          lesson_id: l.id, date: l.scheduled_date, time: l.scheduled_time?.slice(0, 5) ?? null,
          group_name: l.class_group?.name ?? '', subject: l.class_group?.subject?.name_he || l.class_group?.subject?.name || null,
          attendance_id: a?.id ?? null, status: a?.status ?? null,
          substitute: extraIds.has(l.id),
        }
      }) })
    }

    // mine
    try {
      const { data, error } = await sb.from('teacher_attendance')
        .select('id, lesson_id, status, note, reported_at, decided_at')
        .eq('teacher_person_id', session.person_id)
        .order('reported_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as Array<{ id: string; lesson_id: string; status: string; note: string | null; reported_at: string; decided_at: string | null }>
      const info = await lessonInfo(sb, rows.map(r => r.lesson_id))
      return NextResponse.json({ items: rows.map(r => ({ ...r, lesson: info.get(r.lesson_id) ?? null })) })
    } catch (e) {
      if (isMissingTable(e)) return NextResponse.json({ items: [] })
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { lesson_id?: string; note?: string }
    const lessonId = (body.lesson_id ?? '').trim()
    if (!lessonId) return apiError('invalid_reference', 400)

    const sb = createServerClient()

    // Решение владельца #5, правило 3: отметиться может ЛЮБОЙ сотрудник
    // (замещающая — тоже), даже если не числится в class_teachers группы.
    // Ученицы отсечены выше (principal='student' → 403). Оплата — только после
    // подтверждения секретариатом; два отметившихся по уроку всплывают у него.
    const { data: lesson } = await sb.from('lessons').select('id').eq('id', lessonId).maybeSingle()
    if (!lesson) return apiError('substage_not_found', 404)

    try {
      // upsert: одна отметка на (lesson, teacher); повторная отметка → снова reported.
      const { data: existing } = await sb.from('teacher_attendance')
        .select('id').eq('lesson_id', lessonId).eq('teacher_person_id', session.person_id).maybeSingle()
      if (existing) {
        const { error } = await sb.from('teacher_attendance')
          .update({ status: 'reported', reported_at: new Date().toISOString(), decided_by: null, decided_at: null, note: (body.note ?? '').trim() || null })
          .eq('id', (existing as { id: string }).id)
        if (error) throw error
      } else {
        const { error } = await sb.from('teacher_attendance')
          .insert({ lesson_id: lessonId, teacher_person_id: session.person_id, status: 'reported', note: (body.note ?? '').trim() || null })
        if (error) throw error
      }
      return NextResponse.json({ ok: true }, { status: 201 })
    } catch (e) {
      if (isMissingTable(e)) return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
