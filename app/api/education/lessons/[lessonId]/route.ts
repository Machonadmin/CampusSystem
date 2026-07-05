import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getLessonAccess } from '@/lib/education/lesson-access'
import type { LessonUpdate } from '@/types/database'

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: 'Неверный идентификатор' }
  if (error.code === '23503') return { status: 400, message: 'Ссылка на несуществующую запись' }
  if (error.code === '23505') return { status: 409, message: 'Урок на эту дату и время уже существует' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

/**
 * GET /api/education/lessons/[lessonId]
 * Один урок вместе с его посещаемостью.
 * Право: view_students в контексте группы урока.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { lessonId: string } }
) {
  try {
    const sb = createServerClient()

    const access = await getLessonAccess(sb, params.lessonId)
    if (!access) return NextResponse.json({ error: 'Урок не найден' }, { status: 404 })

    await requireEducationPrivilege('view_students', access.target)

    const { data: attendance, error } = await sb
      .from('attendance')
      .select('id, journey_id, status, marked_by, marked_at')
      .eq('lesson_id', params.lessonId)
    if (error) throw error

    return NextResponse.json({ ...access.lesson, attendance: attendance ?? [] })
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
 * PATCH /api/education/lessons/[lessonId]
 * Редактирование урока. Право: set_lesson_topics в контексте группы урока.
 * Разрешено менять: scheduled_date, scheduled_time, topic, description, location, is_cancelled.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { lessonId: string } }
) {
  try {
    const body = await request.json() as {
      scheduled_date?: string
      scheduled_time?: string | null
      topic?: string | null
      description?: string | null
      location?: string | null
      is_cancelled?: boolean
    }

    const sb = createServerClient()

    const access = await getLessonAccess(sb, params.lessonId)
    if (!access) return NextResponse.json({ error: 'Урок не найден' }, { status: 404 })

    await requireEducationPrivilege('set_lesson_topics', access.target)

    const update: LessonUpdate = {}
    if (body.scheduled_date !== undefined) {
      const d = body.scheduled_date?.trim()
      if (!d) return NextResponse.json({ error: 'scheduled_date не может быть пустым' }, { status: 400 })
      update.scheduled_date = d
    }
    if (body.scheduled_time !== undefined) update.scheduled_time = body.scheduled_time?.trim() || null
    if (body.topic !== undefined) update.topic = body.topic?.trim() || null
    if (body.description !== undefined) update.description = body.description?.trim() || null
    if (body.location !== undefined) update.location = body.location?.trim() || null
    if (body.is_cancelled !== undefined) update.is_cancelled = body.is_cancelled

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    const { data, error } = await sb
      .from('lessons')
      .update(update)
      .eq('id', params.lessonId)
      .select('*')
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data)
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
 * DELETE /api/education/lessons/[lessonId]
 * Удаление урока. Право: set_lesson_topics в контексте группы урока.
 * Посещаемость удаляется каскадно (ON DELETE CASCADE).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { lessonId: string } }
) {
  try {
    const sb = createServerClient()

    const access = await getLessonAccess(sb, params.lessonId)
    if (!access) return NextResponse.json({ error: 'Урок не найден' }, { status: 404 })

    await requireEducationPrivilege('set_lesson_topics', access.target)

    const { error } = await sb.from('lessons').delete().eq('id', params.lessonId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
