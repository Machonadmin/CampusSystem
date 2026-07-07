import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireDormitoryPrivilege } from '@/lib/dormitory/permissions'
import { mapDbError } from '@/lib/dormitory/http'
import { isIsoDate } from '@/lib/dormitory/validation'
import { canAssign } from '@/lib/dormitory/occupancy'
import { countRoomActiveOverlaps, journeyHasActiveOverlap } from '@/lib/dormitory/occupancy-server'
import type { DormAssignmentUpdate } from '@/types/database'

/**
 * PATCH /api/dormitory/assignments/[id] — завершить назначение
 *   (status='ended' + assigned_to) или изменить даты. Право: dormitory.manage.
 *   Если после правки назначение остаётся активным — заново проверяются
 *   вместимость комнаты и отсутствие двойного бронирования студента (исключая
 *   само это назначение); 409 при конфликте.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDormitoryPrivilege('manage')

    const body = await request.json() as {
      assigned_from?: string
      assigned_to?: string | null
      status?: string
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('dorm_assignments')
      .select('id, room_id, journey_id, assigned_from, assigned_to, status')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return NextResponse.json({ error: 'Назначение не найдено' }, { status: 404 })

    const update: DormAssignmentUpdate = {}

    if (body.assigned_from !== undefined) {
      const f = body.assigned_from?.trim()
      if (!f || !isIsoDate(f)) return NextResponse.json({ error: 'assigned_from должен быть датой YYYY-MM-DD' }, { status: 400 })
      update.assigned_from = f
    }
    if (body.assigned_to !== undefined) {
      if (body.assigned_to === null || body.assigned_to === '') update.assigned_to = null
      else {
        const t = body.assigned_to.trim()
        if (!isIsoDate(t)) return NextResponse.json({ error: 'assigned_to должен быть датой YYYY-MM-DD' }, { status: 400 })
        update.assigned_to = t
      }
    }
    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'ended') {
        return NextResponse.json({ error: "status должен быть 'active' или 'ended'" }, { status: 400 })
      }
      update.status = body.status
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    // Итоговые значения после правки.
    const finalStatus = update.status ?? existing.status
    const finalFrom = update.assigned_from ?? existing.assigned_from
    const finalTo = update.assigned_to !== undefined ? update.assigned_to : existing.assigned_to

    if (finalTo !== null && finalTo < finalFrom) {
      return NextResponse.json({ error: 'assigned_to не может быть раньше assigned_from' }, { status: 400 })
    }

    // Пере-проверка конфликтов ТОЛЬКО если назначение остаётся активным.
    if (finalStatus === 'active') {
      const [existingOverlaps, studentOverlap] = await Promise.all([
        countRoomActiveOverlaps(sb, existing.room_id, finalFrom, finalTo, existing.id),
        journeyHasActiveOverlap(sb, existing.journey_id, finalFrom, finalTo, existing.id),
      ])
      // capacity комнаты
      const { data: room, error: rErr } = await sb
        .from('dorm_rooms').select('capacity').eq('id', existing.room_id).maybeSingle()
      if (rErr) throw rErr
      const decision = canAssign({
        roomCapacity: room?.capacity ?? 0,
        existingActiveOverlapping: existingOverlaps,
        studentHasActiveOverlap: studentOverlap,
      })
      if (!decision.ok) {
        const message = decision.reason === 'room_full'
          ? 'Комната заполнена на выбранные даты'
          : 'У студента уже есть назначение, пересекающееся по датам'
        return NextResponse.json({ error: message, reason: decision.reason }, { status: 409 })
      }
    }

    const { data, error } = await sb
      .from('dorm_assignments')
      .update(update)
      .eq('id', params.id)
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
