import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getClassGroupTarget, getEnrolledJourneyIds } from '@/lib/education/lesson-access'
import type { LessonInsert } from '@/types/database'

// Размер страницы для агрегаций (attendance). PostgREST обрезает на db-max-rows.
const PAGE = 1000

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: serverT('invalid_id') }
  if (error.code === '23503') return { status: 400, message: serverT('invalid_reference') }
  if (error.code === '23505') return { status: 409, message: serverT('lesson_exists_date_time') }
  return { status: 500, message: error.message ?? serverT('db_error') }
}

/**
 * GET /api/education/class-groups/[id]/lessons
 * Список уроков учебной группы по убыванию даты.
 * Каждый урок дополнен marked_count (сколько отметок посещаемости),
 * а ответ — enrolled_count (сколько студентов записано в группу).
 * Право: view_students в контексте группы.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sb = createServerClient()

    const target = await getClassGroupTarget(sb, params.id)
    if (!target) return apiError('group_not_found', 404)

    await requireEducationPrivilege('view_students', target)

    const { data, error } = await sb
      .from('lessons')
      .select('*')
      .eq('class_group_id', params.id)
      .order('scheduled_date', { ascending: false })
      .order('scheduled_time', { ascending: false, nullsFirst: false })
    if (error) throw error

    const lessons = data ?? []

    // Сводка посещаемости: сколько отметок у каждого урока + сколько записано в группу
    const enrolledIds = await getEnrolledJourneyIds(sb, params.id)

    // Разбивка по статусам, а не просто «сколько отмечено»: снаружи «6/6» читалось
    // как «все были», хотя это лишь «6 отмечено». Теперь считаем present/late/absent.
    type Tally = { marked: number; present: number; late: number; absent: number }
    const statsByLesson = new Map<string, Tally>()
    if (lessons.length > 0) {
      const lessonIds = lessons.map(l => l.id)
      // Постранично: единый .in(...) молча обрезался бы на db-max-rows (~1000)
      // и дал бы заниженные счётчики. Читаем все отметки страницами по PAGE.
      let from = 0
      for (;;) {
        const { data: attRows, error: attErr } = await sb
          .from('attendance')
          .select('lesson_id, status')
          .in('lesson_id', lessonIds)
          .order('lesson_id', { ascending: true })
          .range(from, from + PAGE - 1)
        if (attErr) throw attErr
        const rows = (attRows ?? []) as Array<{ lesson_id: string; status: string }>
        for (const row of rows) {
          const cur = statsByLesson.get(row.lesson_id) ?? { marked: 0, present: 0, late: 0, absent: 0 }
          cur.marked += 1
          if (row.status === 'present') cur.present += 1
          else if (row.status === 'late') cur.late += 1
          else if (row.status === 'absent') cur.absent += 1
          statsByLesson.set(row.lesson_id, cur)
        }
        if (rows.length < PAGE) break
        from += PAGE
      }
    }

    return NextResponse.json({
      lessons: lessons.map(l => {
        const s = statsByLesson.get(l.id) ?? { marked: 0, present: 0, late: 0, absent: 0 }
        return { ...l, marked_count: s.marked, present_count: s.present, late_count: s.late, absent_count: s.absent }
      }),
      enrolled_count: enrolledIds.size,
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
 * POST /api/education/class-groups/[id]/lessons
 * Создание урока. Право: set_lesson_topics в контексте группы.
 *
 * Body: { scheduled_date (обязательно), scheduled_time?, topic?, description?, location? }
 * created_by = текущий пользователь.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as {
      scheduled_date?: string
      scheduled_time?: string | null
      topic?: string | null
      description?: string | null
      location?: string | null
    }

    const scheduledDate = body.scheduled_date?.trim()
    if (!scheduledDate) {
      return apiError('scheduled_date_required', 400)
    }

    const sb = createServerClient()

    const target = await getClassGroupTarget(sb, params.id)
    if (!target) return apiError('group_not_found', 404)

    const session = await requireEducationPrivilege('set_lesson_topics', target)

    const insert: LessonInsert = {
      class_group_id: params.id,
      scheduled_date: scheduledDate,
      scheduled_time: body.scheduled_time?.trim() || null,
      topic: body.topic?.trim() || null,
      description: body.description?.trim() || null,
      location: body.location?.trim() || null,
      created_by: session.person_id,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('lessons')
      .insert(insert as any)
      .select('*')
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
