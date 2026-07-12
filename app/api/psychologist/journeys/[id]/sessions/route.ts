import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requirePsychologistPrivilege } from '@/lib/psychologist/permissions'
import { mapDbError } from '@/lib/psychologist/http'
import { isIsoDate, isSessionType } from '@/lib/psychologist/validation'
import type { PsychSessionInsert } from '@/types/database'

/**
 * GET  /api/psychologist/journeys/[id]/sessions — консультации студента, свежие
 *   сверху (view).
 * POST /api/psychologist/journeys/[id]/sessions — записать консультацию (manage):
 *   session_date (обяз.), session_type (default 'followup'), summary,
 *   follow_up_date?. Аудит-колонки counselor_id/created_by заполняются из сессии
 *   (проводивший консультацию). Статус новой сессии — 'open'. ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ.
 */

const SESSION_COLS =
  'id, journey_id, session_date, session_type, summary, follow_up_date, status, counselor_id, created_by, created_at, updated_at'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requirePsychologistPrivilege('view')

    const sb = createServerClient()

    const { data, error } = await sb
      .from('psych_sessions')
      .select(SESSION_COLS)
      .eq('journey_id', params.id)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error

    return NextResponse.json({ sessions: data ?? [] })
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
    const session = await requirePsychologistPrivilege('manage')

    const body = await request.json() as {
      session_date?: string
      session_type?: string
      summary?: string | null
      follow_up_date?: string | null
    }

    const sessionDate = body.session_date?.trim()
    if (!sessionDate || !isIsoDate(sessionDate)) {
      return apiError('session_date_required_date', 400)
    }

    // session_type: если задан — обязан быть допустимым; иначе default 'followup'.
    let sessionType: 'intake' | 'followup' | 'crisis' | 'group' | 'other' = 'followup'
    if (body.session_type !== undefined && body.session_type !== null && body.session_type !== '') {
      if (!isSessionType(body.session_type)) {
        return apiError('invalid_consultation_type', 400)
      }
      sessionType = body.session_type
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

    const insert: PsychSessionInsert = {
      journey_id: params.id,
      session_date: sessionDate,
      session_type: sessionType,
      summary: body.summary?.trim() || null,
      follow_up_date: followUp,
      status: 'open',
      counselor_id: session.person_id,
      created_by: session.person_id,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('psych_sessions')
      .insert(insert as any)
      .select(SESSION_COLS)
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
