import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'

/**
 * Нокхут морим (נוכחות מורים).
 *   GET ?scope=mine    → мои отметки (учитель): урок + статус.
 *   GET ?scope=pending → на подтверждение (секретариат: manage_students/superadmin).
 *   POST { lesson_id } → учитель отмечает «пришёл» на СВОЙ урок (class_teacher).
 * Деплой-безопасно (42P01 → пусто/503).
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

type LessonLite = { id: string; scheduled_date: string | null; scheduled_time: string | null; class_group_id: string }

async function lessonInfo(sb: ReturnType<typeof createServerClient>, lessonIds: string[]) {
  const byId = new Map<string, { date: string | null; time: string | null; group_name: string; subject: string | null }>()
  const ids = [...new Set(lessonIds.filter(Boolean))]
  if (ids.length === 0) return byId
  const { data: lessons } = await sb.from('lessons')
    .select('id, scheduled_date, scheduled_time, class_group:class_groups(name, subject:subjects(name))')
    .in('id', ids)
  for (const l of (lessons ?? []) as unknown as Array<{ id: string; scheduled_date: string | null; scheduled_time: string | null; class_group: { name: string; subject: { name: string } | null } | null }>) {
    byId.set(l.id, {
      date: l.scheduled_date, time: l.scheduled_time?.slice(0, 5) ?? null,
      group_name: l.class_group?.name ?? '', subject: l.class_group?.subject?.name ?? null,
    })
  }
  return byId
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
        const { data, error } = await u(sb).from('teacher_attendance')
          .select('id, lesson_id, teacher_person_id, status, note, reported_at')
          .eq('status', 'reported')
          .order('reported_at', { ascending: true })
        if (error) throw error
        const rows = (data ?? []) as Array<{ id: string; lesson_id: string; teacher_person_id: string; status: string; note: string | null; reported_at: string }>
        const info = await lessonInfo(sb, rows.map(r => r.lesson_id))
        const names = new Map<string, string>()
        const tids = [...new Set(rows.map(r => r.teacher_person_id))]
        if (tids.length) {
          const { data: ps } = await sb.from('persons').select('id, full_name, hebrew_name').in('id', tids)
          for (const p of (ps ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) names.set(p.id, (p.hebrew_name || p.full_name || '').trim())
        }
        return NextResponse.json({ items: rows.map(r => ({ ...r, teacher_name: names.get(r.teacher_person_id) ?? '', lesson: info.get(r.lesson_id) ?? null })) })
      } catch (e) {
        if ((e as { code?: string }).code === '42P01') return NextResponse.json({ items: [] })
        throw e
      }
    }

    if (scope === 'lessons') {
      // Мои уроки (как преподаватель) за окно [−21д, +7д] + статус отметки, если есть.
      // Учитель выбирает урок и жмёт «я был» прямо в этом списке.
      const { data: ct } = await sb.from('class_teachers').select('class_group_id').eq('teacher_id', session.person_id)
      const groupIds = [...new Set((ct ?? []).map(r => (r as { class_group_id: string }).class_group_id))]
      if (groupIds.length === 0) return NextResponse.json({ items: [] })
      const today = new Date()
      const from = new Date(today.getTime() - 21 * 86400000).toISOString().slice(0, 10)
      const to = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10)
      const { data: lessons } = await sb.from('lessons')
        .select('id, scheduled_date, scheduled_time, is_cancelled, class_group:class_groups(name, subject:subjects(name, name_he))')
        .in('class_group_id', groupIds)
        .gte('scheduled_date', from).lte('scheduled_date', to)
        .order('scheduled_date', { ascending: false }).order('scheduled_time', { ascending: false, nullsFirst: false })
      const lrows = (lessons ?? []) as unknown as Array<{ id: string; scheduled_date: string | null; scheduled_time: string | null; is_cancelled: boolean; class_group: { name: string; subject: { name: string; name_he: string | null } | null } | null }>
      const statusByLesson = new Map<string, { id: string; status: string }>()
      try {
        const { data: att } = await u(sb).from('teacher_attendance')
          .select('id, lesson_id, status').eq('teacher_person_id', session.person_id).in('lesson_id', lrows.map(l => l.id))
        for (const a of (att ?? []) as Array<{ id: string; lesson_id: string; status: string }>) statusByLesson.set(a.lesson_id, { id: a.id, status: a.status })
      } catch (e) {
        if ((e as { code?: string }).code !== '42P01') throw e
      }
      return NextResponse.json({ items: lrows.filter(l => !l.is_cancelled).map(l => {
        const a = statusByLesson.get(l.id)
        return {
          lesson_id: l.id, date: l.scheduled_date, time: l.scheduled_time?.slice(0, 5) ?? null,
          group_name: l.class_group?.name ?? '', subject: l.class_group?.subject?.name_he || l.class_group?.subject?.name || null,
          attendance_id: a?.id ?? null, status: a?.status ?? null,
        }
      }) })
    }

    // mine
    try {
      const { data, error } = await u(sb).from('teacher_attendance')
        .select('id, lesson_id, status, note, reported_at, decided_at')
        .eq('teacher_person_id', session.person_id)
        .order('reported_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as Array<{ id: string; lesson_id: string; status: string; note: string | null; reported_at: string; decided_at: string | null }>
      const info = await lessonInfo(sb, rows.map(r => r.lesson_id))
      return NextResponse.json({ items: rows.map(r => ({ ...r, lesson: info.get(r.lesson_id) ?? null })) })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ items: [] })
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
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

    // Урок → его группа → я должен быть преподавателем этой группы.
    const { data: lesson } = await sb.from('lessons').select('id, class_group_id').eq('id', lessonId).maybeSingle()
    if (!lesson) return apiError('substage_not_found', 404)
    const { data: ct } = await sb.from('class_teachers')
      .select('teacher_id').eq('class_group_id', (lesson as { class_group_id: string }).class_group_id).eq('teacher_id', session.person_id).maybeSingle()
    if (!ct) return apiError('forbidden', 403)

    try {
      // upsert: одна отметка на (lesson, teacher); повторная отметка → снова reported.
      const { data: existing } = await u(sb).from('teacher_attendance')
        .select('id').eq('lesson_id', lessonId).eq('teacher_person_id', session.person_id).maybeSingle()
      if (existing) {
        const { error } = await u(sb).from('teacher_attendance')
          .update({ status: 'reported', reported_at: new Date().toISOString(), decided_by: null, decided_at: null, note: (body.note ?? '').trim() || null })
          .eq('id', (existing as { id: string }).id)
        if (error) throw error
      } else {
        const { error } = await u(sb).from('teacher_attendance')
          .insert({ lesson_id: lessonId, teacher_person_id: session.person_id, status: 'reported', note: (body.note ?? '').trim() || null })
        if (error) throw error
      }
      return NextResponse.json({ ok: true }, { status: 201 })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
