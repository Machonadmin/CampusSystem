import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getClassGroupTarget, getEnrolledJourneyIds } from '@/lib/education/lesson-access'
import type { LessonInsert } from '@/types/database'

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: 'Неверный идентификатор' }
  if (error.code === '23503') return { status: 400, message: 'Ссылка на несуществующую запись' }
  if (error.code === '23505') return { status: 409, message: 'Урок на эту дату и время уже существует' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
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
    if (!target) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 })

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

    const markedByLesson = new Map<string, number>()
    if (lessons.length > 0) {
      const lessonIds = lessons.map(l => l.id)
      const { data: attRows, error: attErr } = await sb
        .from('attendance')
        .select('lesson_id')
        .in('lesson_id', lessonIds)
      if (attErr) throw attErr
      for (const row of attRows ?? []) {
        markedByLesson.set(row.lesson_id, (markedByLesson.get(row.lesson_id) ?? 0) + 1)
      }
    }

    return NextResponse.json({
      lessons: lessons.map(l => ({ ...l, marked_count: markedByLesson.get(l.id) ?? 0 })),
      enrolled_count: enrolledIds.size,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
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
      return NextResponse.json({ error: 'scheduled_date обязателен' }, { status: 400 })
    }

    const sb = createServerClient()

    const target = await getClassGroupTarget(sb, params.id)
    if (!target) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 })

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
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
