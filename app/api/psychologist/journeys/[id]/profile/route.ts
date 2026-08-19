import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requirePsychologistPrivilege } from '@/lib/psychologist/permissions'
import { mapDbError } from '@/lib/psychologist/http'
import { isRiskLevel } from '@/lib/psychologist/validation'
import type { PsychProfileInsert } from '@/types/database'

/**
 * GET /api/psychologist/journeys/[id]/profile — карта сопровождения студента
 *   (view). null, если карты ещё нет.
 * PUT /api/psychologist/journeys/[id]/profile — создать/обновить карту (manage).
 *   Одна карта на journey (UNIQUE journey_id) — upsert по journey_id.
 *   ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ.
 */

const PROFILE_COLS =
  'id, journey_id, presenting_concerns, background, risk_level, referral_source, notes, created_at, updated_at'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requirePsychologistPrivilege('view')

    const sb = createServerClient()

    const { data, error } = await sb
      .from('psych_profiles')
      .select(PROFILE_COLS)
      .eq('journey_id', params.id)
      .maybeSingle()
    if (error) throw error

    return NextResponse.json({ profile: data ?? null })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requirePsychologistPrivilege('manage')

    const body = await request.json() as {
      presenting_concerns?: string | null
      background?: string | null
      risk_level?: string | null
      referral_source?: string | null
      notes?: string | null
    }

    // risk_level: если задан — обязан быть допустимым; иначе default 'none'.
    let riskLevel: 'none' | 'low' | 'medium' | 'high' = 'none'
    if (body.risk_level !== undefined && body.risk_level !== null && body.risk_level !== '') {
      if (!isRiskLevel(body.risk_level)) {
        return apiError('invalid_risk_level', 400)
      }
      riskLevel = body.risk_level
    }

    const sb = createServerClient()

    const { data: journey, error: jErr } = await sb
      .from('education_journeys').select('id').eq('id', params.id).maybeSingle()
    if (jErr) throw jErr
    if (!journey) return apiError('student_not_found', 400)

    const payload: PsychProfileInsert = {
      journey_id: params.id,
      presenting_concerns: body.presenting_concerns?.trim() || null,
      background: body.background?.trim() || null,
      risk_level: riskLevel,
      referral_source: body.referral_source?.trim() || null,
      notes: body.notes?.trim() || null,
    }

    const { data, error } = await sb
      .from('psych_profiles')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(payload as any, { onConflict: 'journey_id' })
      .select(PROFILE_COLS)
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
