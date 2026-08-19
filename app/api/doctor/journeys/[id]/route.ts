import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireDoctorPrivilege } from '@/lib/doctor/permissions'
import { mapDbError } from '@/lib/doctor/http'

/**
 * GET /api/doctor/journeys/[id] — медкарта студента + история приёмов (свежие
 *   сверху). [id] = journey_id. Право: doctor.view. Ответ: { profile, visits }.
 *   profile === null, если медкарта ещё не заведена. ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ.
 */

const PROFILE_COLS =
  'id, journey_id, blood_type, chronic_conditions, allergies, medications, emergency_contact, notes, created_at, updated_at'
const VISIT_COLS =
  'id, journey_id, visit_date, reason, diagnosis, treatment, attended_by, follow_up_date, status, notes, created_by, created_at, updated_at'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDoctorPrivilege('view')

    const sb = createServerClient()

    const { data: profile, error: pErr } = await sb
      .from('medical_profiles')
      .select(PROFILE_COLS)
      .eq('journey_id', params.id)
      .maybeSingle()
    if (pErr) throw pErr

    const { data: visits, error: vErr } = await sb
      .from('medical_visits')
      .select(VISIT_COLS)
      .eq('journey_id', params.id)
      .order('visit_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (vErr) throw vErr

    return NextResponse.json({ profile: profile ?? null, visits: visits ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
