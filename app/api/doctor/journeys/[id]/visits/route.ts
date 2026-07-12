import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireDoctorPrivilege } from '@/lib/doctor/permissions'
import { mapDbError } from '@/lib/doctor/http'
import { isIsoDate } from '@/lib/doctor/validation'
import type { MedicalVisitInsert } from '@/types/database'

/**
 * GET  /api/doctor/journeys/[id]/visits — приёмы студента, свежие сверху (view).
 * POST /api/doctor/journeys/[id]/visits — записать приём (manage):
 *   visit_date (обяз.), reason, diagnosis, treatment, follow_up_date?, notes.
 *   Аудит-колонки created_by/attended_by заполняются из сессии (записавший
 *   клиницист). Статус нового приёма — 'open'. ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ.
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
      .from('medical_visits')
      .select(VISIT_COLS)
      .eq('journey_id', params.id)
      .order('visit_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error

    return NextResponse.json({ visits: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireDoctorPrivilege('manage')

    const body = await request.json() as {
      visit_date?: string
      reason?: string | null
      diagnosis?: string | null
      treatment?: string | null
      follow_up_date?: string | null
      notes?: string | null
    }

    const visitDate = body.visit_date?.trim()
    if (!visitDate || !isIsoDate(visitDate)) {
      return apiError('visit_date_required_date', 400)
    }

    let followUp: string | null = null
    if (body.follow_up_date !== undefined && body.follow_up_date !== null && body.follow_up_date !== '') {
      followUp = body.follow_up_date.trim()
      if (!isIsoDate(followUp)) {
        return apiError('follow_up_date_must_be_date', 400)
      }
    }

    const sb = createServerClient()

    const { data: journey, error: jErr } = await sb
      .from('education_journeys').select('id').eq('id', params.id).maybeSingle()
    if (jErr) throw jErr
    if (!journey) return apiError('student_not_found', 400)

    const insert: MedicalVisitInsert = {
      journey_id: params.id,
      visit_date: visitDate,
      reason: body.reason?.trim() || null,
      diagnosis: body.diagnosis?.trim() || null,
      treatment: body.treatment?.trim() || null,
      follow_up_date: followUp,
      notes: body.notes?.trim() || null,
      status: 'open',
      attended_by: session.person_id,
      created_by: session.person_id,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('medical_visits')
      .insert(insert as any)
      .select(VISIT_COLS)
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
