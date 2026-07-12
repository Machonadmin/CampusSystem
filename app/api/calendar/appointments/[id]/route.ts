import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { mapDbError } from '@/lib/calendar/http'
import { isAppointmentStatus, isIsoDateTime } from '@/lib/calendar/validation'
import { hasOverlappingAppointment } from '@/lib/calendar/overlap'
import type { AppointmentUpdate } from '@/types/database'

/**
 * PATCH  /api/calendar/appointments/[id] — правка встречи / смена статуса
 *   (completed / cancelled / no_show). При изменении времён — повторная проверка
 *   пересечения (409). ТОЛЬКО строки владельца (provider_id = session.person_id).
 * DELETE /api/calendar/appointments/[id] — удалить встречу (только владелец).
 */

const COLS =
  'id, provider_id, journey_id, title, reason, starts_at, ends_at, status, notes, created_by, created_at, updated_at'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await requireCalendarUser()

    const body = await request.json() as {
      title?: string
      journey_id?: string | null
      starts_at?: string
      ends_at?: string
      reason?: string | null
      notes?: string | null
      status?: string
    }

    const sb = createServerClient()

    // Существующая встреча — строго СВОЯ.
    const { data: existing, error: exErr } = await sb
      .from('appointments')
      .select('id, provider_id, starts_at, ends_at, status')
      .eq('id', params.id)
      .eq('provider_id', session.person_id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return apiError('meeting_not_found', 404)

    const update: AppointmentUpdate = {}

    if (body.title !== undefined) {
      const title = body.title?.trim()
      if (!title) return apiError('title_field_not_empty', 400)
      update.title = title
    }

    if (body.status !== undefined) {
      if (!isAppointmentStatus(body.status)) {
        return apiError('invalid_status', 400)
      }
      update.status = body.status
    }

    if (body.starts_at !== undefined && !isIsoDateTime(body.starts_at)) {
      return apiError('starts_at_iso', 400)
    }
    if (body.ends_at !== undefined && !isIsoDateTime(body.ends_at)) {
      return apiError('ends_at_iso', 400)
    }

    // Итоговые времена (учитываем частичное обновление одного из полей).
    const nextStarts = body.starts_at ?? (existing.starts_at as string)
    const nextEnds = body.ends_at ?? (existing.ends_at as string)
    const timesChanged = body.starts_at !== undefined || body.ends_at !== undefined

    if (timesChanged) {
      if (Date.parse(nextEnds) <= Date.parse(nextStarts)) {
        return apiError('ends_after_starts', 400)
      }
      if (body.starts_at !== undefined) update.starts_at = body.starts_at
      if (body.ends_at !== undefined) update.ends_at = body.ends_at
    }

    // Итоговый статус: если встреча останется scheduled и времена меняются —
    // перепроверяем пересечение. Cancelled/completed/no_show слот не занимают.
    const nextStatus = update.status ?? (existing.status as string)
    if (nextStatus === 'scheduled' && (timesChanged || update.status === 'scheduled')) {
      const overlap = await hasOverlappingAppointment(sb, session.person_id, nextStarts, nextEnds, params.id)
      if (overlap) {
        return apiError('meeting_overlap', 409)
      }
    }

    if (body.journey_id !== undefined) update.journey_id = body.journey_id?.trim() || null
    if (body.reason !== undefined) update.reason = body.reason?.trim() || null
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null

    if (Object.keys(update).length === 0) {
      return apiError('no_changes', 400)
    }

    const { data, error } = await sb
      .from('appointments')
      .update(update)
      .eq('id', params.id)
      .eq('provider_id', session.person_id)
      .select(COLS)
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()

    const { data, error } = await sb
      .from('appointments')
      .delete()
      .eq('id', params.id)
      .eq('provider_id', session.person_id)
      .select('id')
      .maybeSingle()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    if (!data) return apiError('meeting_not_found', 404)

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
