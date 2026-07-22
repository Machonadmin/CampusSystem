import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getClassGroupTarget } from '@/lib/education/lesson-access'
import { collidesWithKodesh } from '@/lib/education/kodesh-schedule'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'
import type { ScheduleSlotInsert } from '@/types/database'

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: serverT('invalid_id') }
  if (error.code === '23503') return { status: 400, message: serverT('invalid_reference') }
  if (error.code === '23505') return { status: 409, message: serverT('slot_exists_day_time') }
  if (error.code === '23514') return { status: 400, message: serverT('db_constraint_slot') }
  return { status: 500, message: error.message ?? serverT('db_error') }
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
    if (!target) return apiError('group_not_found', 404)

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
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
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
      building_id?: string | null
      room_id?: string | null
    }

    const dow = Number(body.day_of_week)
    if (!Number.isInteger(dow) || dow < 1 || dow > 7) {
      return apiError('day_of_week_1_7', 400)
    }

    const start = body.start_time?.trim()
    const end = body.end_time?.trim()
    if (!start || !end) {
      return apiError('start_end_time_required', 400)
    }
    const startSec = timeToSeconds(start)
    const endSec = timeToSeconds(end)
    if (startSec === null || endSec === null) {
      return apiError('invalid_time_format', 400)
    }
    if (endSec <= startSec) {
      return apiError('end_after_start', 400)
    }

    const sb = createServerClient()

    const target = await getClassGroupTarget(sb, params.id)
    if (!target) return apiError('group_not_found', 404)

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

    // building_id / room_id — деплой-безопасным UPDATE (новые колонки могут
    // отсутствовать; свободный текст room уже сохранён выше). Ошибку 42703
    // (нет колонок) молча игнорируем.
    if ((body.building_id || body.room_id) && data?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: locErr } = await (sb as any).from('class_schedule_slots')
        .update({ building_id: body.building_id ?? null, room_id: body.room_id ?? null })
        .eq('id', data.id)
      void locErr // деградируем молча, если колонок ещё нет
    }

    // Мягкое правило: первые два урока дня — под יהדות. Если обычный курс (не
    // кодеш-группа) ставит занятие на зарезервированное время — предупреждаем.
    const warning = target.department_id !== KODESH_DEPT_ID && collidesWithKodesh(dow, start, end)
      ? serverT('kodesh_slot_warning')
      : undefined

    return NextResponse.json({ ...(data as object), ...(warning ? { warning } : {}) }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
