import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { journeyDeptTarget } from '@/lib/education/journey-target'
import { getCookieLocale } from '@/lib/i18n/locale'

/**
 * GET /api/education/journeys/[id]/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Календарь студентки: её уроки (по всем её учебным группам — §3 «две системы»
 * сливаются в один календарь) в диапазоне дат, с её статусом посещаемости на
 * каждый урок, преподавателем, предметом и темой. Только чтение/агрегация.
 *
 * Право: view_students в подразделении студентки (или superadmin) — как карточка.
 * Деплой-безопасно к отсутствию таблиц (пустой список).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()
    const allowed = session.roles.includes('superadmin')
      || await hasEducationPrivilege(session, 'view_students', await journeyDeptTarget(sb, params.id))
    if (!allowed) return apiError('forbidden', 403)

    const lang = getCookieLocale()
    const from = (request.nextUrl.searchParams.get('from') ?? '').trim()
    const to = (request.nextUrl.searchParams.get('to') ?? '').trim()

    // 1. Её учебные группы.
    const { data: enr } = await sb.from('class_enrollments').select('class_group_id').eq('journey_id', params.id)
    const groupIds = [...new Set((enr ?? []).map(e => (e as { class_group_id: string }).class_group_id))]
    if (groupIds.length === 0) return NextResponse.json({ lessons: [] })

    // 2. Уроки этих групп в диапазоне (месяц студентки — заведомо < db-max-rows).
    let q = sb.from('lessons')
      .select('id, class_group_id, scheduled_date, scheduled_time, scheduled_end_time, topic, is_cancelled, class_group:class_groups(name, subject:subjects(name, name_he))')
      .in('class_group_id', groupIds)
    if (from) q = q.gte('scheduled_date', from)
    if (to) q = q.lte('scheduled_date', to)
    const { data: lessonsRaw, error: lErr } = await q
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true, nullsFirst: true })
    if (lErr) {
      if ((lErr as { code?: string }).code === '42P01') return NextResponse.json({ lessons: [] })
      throw lErr
    }
    const lessons = (lessonsRaw ?? []) as unknown as Array<{
      id: string; class_group_id: string; scheduled_date: string; scheduled_time: string | null
      scheduled_end_time: string | null; topic: string | null; is_cancelled: boolean
      class_group: { name: string; subject: { name: string; name_he: string | null } | null } | null
    }>

    // 3. Преподаватели по группам (предпочитаем is_primary).
    const teacherByGroup = new Map<string, string>()
    const { data: ct } = await sb.from('class_teachers')
      .select('class_group_id, is_primary, person:persons!class_teachers_teacher_id_fkey(full_name)')
      .in('class_group_id', groupIds)
    for (const r of (ct ?? []) as unknown as Array<{ class_group_id: string; is_primary: boolean; person: { full_name: string | null } | null }>) {
      const name = r.person?.full_name?.trim()
      if (!name) continue
      if (r.is_primary || !teacherByGroup.has(r.class_group_id)) teacherByGroup.set(r.class_group_id, name)
    }

    // 4. Её статус посещаемости по этим урокам.
    const statusByLesson = new Map<string, string>()
    const lessonIds = lessons.map(l => l.id)
    if (lessonIds.length > 0) {
      const { data: att } = await sb.from('attendance').select('lesson_id, status').eq('journey_id', params.id).in('lesson_id', lessonIds)
      for (const a of (att ?? []) as Array<{ lesson_id: string; status: string }>) statusByLesson.set(a.lesson_id, a.status)
    }

    const out = lessons.map(l => {
      const subj = l.class_group?.subject
      return {
        id: l.id,
        date: l.scheduled_date,
        time: l.scheduled_time ? l.scheduled_time.slice(0, 5) : null,
        end_time: l.scheduled_end_time ? l.scheduled_end_time.slice(0, 5) : null,
        topic: l.topic,
        group_name: l.class_group?.name ?? '',
        subject: subj ? (lang === 'he' ? (subj.name_he || subj.name) : subj.name) : null,
        teacher: teacherByGroup.get(l.class_group_id) ?? null,
        status: statusByLesson.get(l.id) ?? null, // present | late | absent | null(не отмечено)
        is_cancelled: l.is_cancelled,
      }
    })

    // Встречи (appointments) этой студентки — тоже сливаются в её календарь (§5).
    let meetings: Array<{ id: string; date: string; time: string | null; title: string; status: string }> = []
    try {
      const { data: appts, error: aErr } = await sb.from('appointments')
        .select('id, title, starts_at, status').eq('journey_id', params.id)
      if (aErr) throw aErr
      meetings = ((appts ?? []) as Array<{ id: string; title: string; starts_at: string; status: string }>)
        .map(a => {
          const d = new Date(a.starts_at)
          const date = isNaN(d.getTime()) ? a.starts_at.slice(0, 10) : d.toISOString().slice(0, 10)
          const time = isNaN(d.getTime()) ? null : d.toISOString().slice(11, 16)
          return { id: a.id, date, time, title: a.title, status: a.status }
        })
        .filter(m => (!from || m.date >= from) && (!to || m.date <= to))
    } catch (e) {
      if ((e as { code?: string }).code !== '42P01') throw e
    }

    return NextResponse.json({ lessons: out, meetings })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
