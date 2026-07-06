import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getClassGroupTarget } from '@/lib/education/lesson-access'
import type { ScheduleSlotInsert } from '@/types/database'

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: 'Неверный идентификатор' }
  if (error.code === '23503') return { status: 400, message: 'Ссылка на несуществующую запись' }
  if (error.code === '23505') return { status: 409, message: 'Слот на этот день и время уже существует' }
  if (error.code === '23514') return { status: 400, message: 'Нарушено ограничение БД (день недели 1–7, конец позже начала)' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

/** 'HH:MM' | 'HH:MM:SS' → секунды от полуночи, или null если формат неверен. */
function timeToSeconds(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const h = Number(m[1]), mi = Number(m[2]), s = m[3] ? Number(m[3]) : 0
  if (h > 23 || mi > 59 || s > 59) return null
  return h * 3600 + mi * 60 + s
}

/**
 * GET /api/education/class-groups/[id]/schedule/slots
 * Список слотов расписания группы, по дню недели и времени начала.
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
      .from('class_schedule_slots')
      .select('*')
      .eq('class_group_id', params.id)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true })
    if (error) throw error

    return NextResponse.json({ slots: data ?? [] })
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
 * POST /api/education/class-groups/[id]/schedule/slots
 * Создание слота расписания. Право: set_lesson_topics в контексте группы.
 *
 * Body: { day_of_week (1-7), start_time, end_time (> start_time), room? }
 * created_by = текущий пользователь.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as {
      day_of_week?: number
      start_time?: string
      end_time?: string
      room?: string | null
    }

    const dow = Number(body.day_of_week)
    if (!Number.isInteger(dow) || dow < 1 || dow > 7) {
      return NextResponse.json({ error: 'day_of_week должен быть целым числом от 1 (Пн) до 7 (Вс)' }, { status: 400 })
    }

    const start = body.start_time?.trim()
    const end = body.end_time?.trim()
    if (!start || !end) {
      return NextResponse.json({ error: 'start_time и end_time обязательны' }, { status: 400 })
    }
    const startSec = timeToSeconds(start)
    const endSec = timeToSeconds(end)
    if (startSec === null || endSec === null) {
      return NextResponse.json({ error: 'Неверный формат времени (ожидается HH:MM)' }, { status: 400 })
    }
    if (endSec <= startSec) {
      return NextResponse.json({ error: 'end_time должен быть позже start_time' }, { status: 400 })
    }

    const sb = createServerClient()

    const target = await getClassGroupTarget(sb, params.id)
    if (!target) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 })

    const session = await requireEducationPrivilege('set_lesson_topics', target)

    const insert: ScheduleSlotInsert = {
      class_group_id: params.id,
      day_of_week: dow,
      start_time: start,
      end_time: end,
      room: body.room?.trim() || null,
      created_by: session.person_id,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('class_schedule_slots')
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
