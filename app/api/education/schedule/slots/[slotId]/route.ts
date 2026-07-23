import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getSlotAccess } from '@/lib/education/lesson-access'
import type { ScheduleSlotUpdate } from '@/types/database'

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
 * PATCH /api/education/schedule/slots/[slotId]
 * Правка слота. Право: set_lesson_topics в контексте группы слота.
 * Разрешено менять: day_of_week, start_time, end_time, room.
 * Не трогает уже сгенерированные уроки.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { slotId: string } }
) {
  try {
    const body = await request.json() as {
      day_of_week?: number
      start_time?: string
      end_time?: string
      room?: string | null
    }

    const sb = createServerClient()

    const access = await getSlotAccess(sb, params.slotId)
    if (!access) return apiError('slot_not_found', 404)

    await requireEducationPrivilege('set_lesson_topics', access.target)

    const update: ScheduleSlotUpdate = {}

    if (body.day_of_week !== undefined) {
      const dow = Number(body.day_of_week)
      if (!Number.isInteger(dow) || dow < 1 || dow > 7) {
        return apiError('day_of_week_1_7', 400)
      }
      update.day_of_week = dow
    }
    if (body.start_time !== undefined) {
      const s = body.start_time?.trim()
      if (!s || timeToSeconds(s) === null) {
        return apiError('invalid_start_time_format', 400)
      }
      update.start_time = s
    }
    if (body.end_time !== undefined) {
      const e = body.end_time?.trim()
      if (!e || timeToSeconds(e) === null) {
        return apiError('invalid_end_time_format', 400)
      }
      update.end_time = e
    }
    if (body.room !== undefined) update.room = body.room?.trim() || null

    if (Object.keys(update).length === 0) {
      return apiError('no_changes', 400)
    }

    // Проверяем итоговую пару start/end (с учётом того, что меняется только часть).
    const effStart = timeToSeconds(update.start_time ?? access.slot.start_time)
    const effEnd = timeToSeconds(update.end_time ?? access.slot.end_time)
    if (effStart !== null && effEnd !== null && effEnd <= effStart) {
      return apiError('end_after_start', 400)
    }

    const { data, error } = await sb
      .from('class_schedule_slots')
      .update(update)
      .eq('id', params.slotId)
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
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/**
 * DELETE /api/education/schedule/slots/[slotId]
 * Удаление слота. Право: set_lesson_topics в контексте группы слота.
 * НЕ трогает никакие уроки (lessons) — слот лишь шаблон.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { slotId: string } }
) {
  try {
    const sb = createServerClient()

    const access = await getSlotAccess(sb, params.slotId)
    if (!access) return apiError('slot_not_found', 404)

    await requireEducationPrivilege('set_lesson_topics', access.target)

    const { error } = await sb.from('class_schedule_slots').delete().eq('id', params.slotId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
