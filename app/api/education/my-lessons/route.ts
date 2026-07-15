import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * GET /api/education/my-lessons?date=YYYY-MM-DD
 * Уроки текущего пользователя-учителя на дату (по умолчанию сегодня): те, где
 * он в class_teachers. Домашний экран учителя — «мои уроки на сегодня» + быстрый
 * переход к отметке посещаемости. Возвращает пусто, если не преподаёт.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()

    const date = (request.nextUrl.searchParams.get('date') ?? '').trim() || new Date().toISOString().slice(0, 10)

    // Группы, которые ведёт этот учитель.
    const { data: ct } = await sb.from('class_teachers').select('class_group_id').eq('teacher_id', session.person_id)
    const groupIds = [...new Set((ct ?? []).map(r => (r as { class_group_id: string }).class_group_id))]
    if (groupIds.length === 0) return NextResponse.json({ date, lessons: [] })

    // Уроки этих групп на дату.
    // scheduled_end_time добавляется миграцией 20260715140000 — читаем через '*',
    // чтобы роут работал и до миграции (deploy-safe), а колонка подхватилась после.
    const { data: lessonsRaw } = await sb
      .from('lessons')
      .select('*, class_group:class_groups(name, subject:subjects(name), department:departments(name))')
      .in('class_group_id', groupIds)
      .eq('scheduled_date', date)
      .order('scheduled_time', { ascending: true, nullsFirst: true })
    const lessons = (lessonsRaw ?? []) as unknown as Array<{
      id: string; class_group_id: string; scheduled_date: string; scheduled_time: string | null
      scheduled_end_time?: string | null; topic: string | null; description: string | null; location: string | null; is_cancelled: boolean
      class_group: { name: string; subject: { name: string } | null; department: { name: string } | null } | null
    }>

    const lessonIds = lessons.map(l => l.id)
    // Счётчики: сколько отмечено + сколько записано (для «X из Y»).
    const markedByLesson = new Map<string, number>()
    const enrolledByGroup = new Map<string, number>()
    if (lessonIds.length > 0) {
      const { data: att } = await sb.from('attendance').select('lesson_id').in('lesson_id', lessonIds)
      for (const a of (att ?? []) as Array<{ lesson_id: string }>) markedByLesson.set(a.lesson_id, (markedByLesson.get(a.lesson_id) ?? 0) + 1)
      const { data: enr } = await sb.from('class_enrollments').select('class_group_id').in('class_group_id', groupIds)
      for (const e of (enr ?? []) as Array<{ class_group_id: string }>) enrolledByGroup.set(e.class_group_id, (enrolledByGroup.get(e.class_group_id) ?? 0) + 1)
    }

    const out = lessons.map(l => ({
      id: l.id,
      class_group_id: l.class_group_id,
      class_group_name: l.class_group?.name ?? '',
      subject: l.class_group?.subject?.name ?? null,
      unit: l.class_group?.department?.name ?? null,
      scheduled_date: l.scheduled_date,
      scheduled_time: l.scheduled_time,
      scheduled_end_time: l.scheduled_end_time ?? null,
      topic: l.topic,
      description: l.description,
      location: l.location,
      is_cancelled: l.is_cancelled,
      marked_count: markedByLesson.get(l.id) ?? 0,
      enrolled_count: enrolledByGroup.get(l.class_group_id) ?? 0,
    }))

    return NextResponse.json({ date, lessons: out })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
