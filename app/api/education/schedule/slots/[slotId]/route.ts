import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getSlotAccess } from '@/lib/education/lesson-access'
import { detectSlotConflicts } from '@/lib/education/slot-conflict-check'
import { createNotifications } from '@/lib/notifications/create'
import type { ScheduleSlotUpdate } from '@/types/database'

/**
 * Уведомляет преподавателей и учениц группы о переносе кабинета урока.
 * Возвращает число уведомлённых. Best-effort (createNotifications не бросает).
 * Тексты уведомлений — на иврите (как в остальных уведомлениях проекта).
 */
async function notifyRoomMove(
  sb: ReturnType<typeof createServerClient>,
  classGroupId: string,
  room: string,
): Promise<number> {
  const { data: g } = await sb.from('class_groups').select('name').eq('id', classGroupId).maybeSingle()
  const groupName = (g as { name?: string } | null)?.name ?? ''

  const recipients = new Set<string>()
  const { data: ct } = await sb.from('class_teachers').select('teacher_id').eq('class_group_id', classGroupId)
  for (const r of (ct ?? []) as Array<{ teacher_id: string }>) recipients.add(r.teacher_id)
  const { data: enr } = await sb.from('class_enrollments').select('journey_id').eq('class_group_id', classGroupId)
  const journeyIds = [...new Set((enr ?? []).map(r => (r as { journey_id: string }).journey_id).filter(Boolean))]
  if (journeyIds.length) {
    const { data: jr } = await sb.from('education_journeys').select('person_id').in('id', journeyIds)
    for (const j of (jr ?? []) as Array<{ person_id: string | null }>) if (j.person_id) recipients.add(j.person_id)
  }
  if (recipients.size === 0) return 0

  await createNotifications(sb, [...recipients].map(pid => ({
    person_id: pid,
    type: 'lesson_room_moved',
    title: 'השיעור עבר חדר',
    body: `קבוצה ${groupName}: החדר החדש הוא ${room}`,
    link: '/dashboard/calendar',
    metadata: { class_group_id: classGroupId, room },
  })))
  return recipients.size
}

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
      room_id?: string | null
      building_id?: string | null
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

    const locationChanged = body.room_id !== undefined || body.building_id !== undefined
    if (Object.keys(update).length === 0 && !locationChanged) {
      return apiError('no_changes', 400)
    }

    // Итоговые значения слота (то, что меняется — берём из body, остальное — старое).
    const effStart = timeToSeconds(update.start_time ?? access.slot.start_time)
    const effEnd = timeToSeconds(update.end_time ?? access.slot.end_time)
    if (effStart !== null && effEnd !== null && effEnd <= effStart) {
      return apiError('end_after_start', 400)
    }
    const effDow = (update.day_of_week ?? access.slot.day_of_week) as number
    const oldRoom = (access.slot as { room: string | null }).room
    const effRoom = body.room !== undefined ? (update.room ?? null) : oldRoom

    // Детект конфликтов ДО правки. КОМНАТА — жёсткая блокировка (409):
    // заставляем выбрать свободный кабинет. Учитель/ученицы — мягкие.
    let softConflicts: Awaited<ReturnType<typeof detectSlotConflicts>> = []
    if (effStart !== null && effEnd !== null) {
      let conflicts: Awaited<ReturnType<typeof detectSlotConflicts>> = []
      try {
        conflicts = await detectSlotConflicts(sb, {
          classGroupId: access.slot.class_group_id, dayOfWeek: effDow,
          startSec: effStart, endSec: effEnd, room: effRoom, roomId: body.room_id ?? null,
        }, params.slotId)
      } catch { /* детект не должен ронять правку */ }
      const roomConflict = conflicts.find(c => c.kind === 'room')
      if (roomConflict) {
        return NextResponse.json({
          error: serverT('room_taken').replace('{room}', roomConflict.detail ?? '').replace('{group}', roomConflict.group_name),
          room_conflict: roomConflict,
        }, { status: 409 })
      }
      softConflicts = conflicts.filter(c => c.kind !== 'room')
    }

    // Основная правка (day/time/room-текст). Если менялись только room_id/
    // building_id — пропускаем update(update) и просто читаем строку.
    let data: unknown
    if (Object.keys(update).length > 0) {
      const res = await sb.from('class_schedule_slots').update(update).eq('id', params.slotId).select('*').single()
      if (res.error) { const m = mapDbError(res.error); return NextResponse.json({ error: m.message }, { status: m.status }) }
      data = res.data
    } else {
      const res = await sb.from('class_schedule_slots').select('*').eq('id', params.slotId).single()
      data = res.data
    }

    // building_id / room_id — деплой-безопасным UPDATE (колонки могут отсутствовать).
    if (locationChanged) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: locErr } = await (sb as any).from('class_schedule_slots')
        .update({ room_id: body.room_id ?? null, building_id: body.building_id ?? null }).eq('id', params.slotId)
      void locErr
    }

    // Перенос кабинета (текст комнаты изменился на непустой) → уведомляем всех
    // משובצים (преподаватели + ученицы) — решение владельца «התראה».
    let notified = 0
    if (effRoom && effRoom !== oldRoom) {
      try { notified = await notifyRoomMove(sb, access.slot.class_group_id, effRoom) } catch { /* best-effort */ }
    }

    return NextResponse.json({
      ...(data as object),
      ...(softConflicts.length ? { conflicts: softConflicts } : {}),
      ...(notified ? { room_move_notified: notified } : {}),
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
