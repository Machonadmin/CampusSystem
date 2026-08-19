import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireDoctorPrivilege } from '@/lib/doctor/permissions'
import { mapDbError } from '@/lib/doctor/http'
import { isIsoDate, isVisitStatus } from '@/lib/doctor/validation'
import { canTransitionVisit } from '@/lib/doctor/medical'
import type { MedicalVisitUpdate } from '@/types/database'

/**
 * GET   /api/doctor/visits/[id] — приём по id (view).
 * PATCH /api/doctor/visits/[id] — правка приёма (manage): клинические поля,
 *   установка/очистка follow_up_date (null → очистить), смена статуса через
 *   canTransitionVisit (open↔closed) — 409 на недопустимом переходе.
 *   ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ.
 */

const VISIT_COLS =
  'id, journey_id, visit_date, reason, diagnosis, treatment, attended_by, follow_up_date, status, notes, created_by, created_at, updated_at'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDoctorPrivilege('view')

    const sb = createServerClient()
    const { data, error } = await sb
      .from('medical_visits').select(VISIT_COLS).eq('id', params.id).maybeSingle()
    if (error) throw error
    if (!data) return apiError('visit_not_found', 404)

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDoctorPrivilege('manage')

    const body = await request.json() as {
      visit_date?: string
      reason?: string | null
      diagnosis?: string | null
      treatment?: string | null
      follow_up_date?: string | null
      notes?: string | null
      status?: string
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('medical_visits')
      .select('id, status')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return apiError('visit_not_found', 404)

    const update: MedicalVisitUpdate = {}

    if (body.status !== undefined) {
      if (!isVisitStatus(body.status)) {
        return apiError('invalid_status', 400)
      }
      if (!canTransitionVisit(existing.status, body.status)) {
        return NextResponse.json(
          { error: `${serverT('invalid_status_transition')}: ${existing.status} → ${body.status}` },
          { status: 409 },
        )
      }
      update.status = body.status
    }

    if (body.visit_date !== undefined) {
      const vd = body.visit_date?.trim()
      if (!vd || !isIsoDate(vd)) {
        return apiError('visit_date_must_be_date', 400)
      }
      update.visit_date = vd
    }

    // follow_up_date: null/'' → очистить; строка → валидировать и установить.
    if (body.follow_up_date !== undefined) {
      if (body.follow_up_date === null || body.follow_up_date === '') {
        update.follow_up_date = null
      } else {
        const fu = body.follow_up_date.trim()
        if (!isIsoDate(fu)) {
          return apiError('follow_up_date_must_be_date', 400)
        }
        update.follow_up_date = fu
      }
    }

    if (body.reason !== undefined) update.reason = body.reason?.trim() || null
    if (body.diagnosis !== undefined) update.diagnosis = body.diagnosis?.trim() || null
    if (body.treatment !== undefined) update.treatment = body.treatment?.trim() || null
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null

    if (Object.keys(update).length === 0) {
      return apiError('no_changes', 400)
    }

    const { data, error } = await sb
      .from('medical_visits')
      .update(update)
      .eq('id', params.id)
      .select(VISIT_COLS)
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
