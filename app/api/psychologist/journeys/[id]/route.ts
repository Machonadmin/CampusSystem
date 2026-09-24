import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requirePsychologistPrivilege } from '@/lib/psychologist/permissions'
import { mapDbError } from '@/lib/psychologist/http'
import { errorResponse } from '@/lib/api/handler'

/**
 * GET /api/psychologist/journeys/[id] — карта сопровождения студента + история
 *   консультаций (свежие сверху). [id] = journey_id. Право: psychologist.view.
 *   Ответ: { profile, sessions }. profile === null, если карта ещё не заведена.
 *   ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ.
 */

const PROFILE_COLS =
  'id, journey_id, presenting_concerns, background, risk_level, referral_source, notes, created_at, updated_at'
const SESSION_COLS =
  'id, journey_id, session_date, session_type, summary, follow_up_date, status, counselor_id, created_by, created_at, updated_at'

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    await requirePsychologistPrivilege('view')

    const sb = createServerClient()

    const { data: profile, error: pErr } = await sb
      .from('psych_profiles')
      .select(PROFILE_COLS)
      .eq('journey_id', params.id)
      .maybeSingle()
    if (pErr) throw pErr

    const { data: sessions, error: sErr } = await sb
      .from('psych_sessions')
      .select(SESSION_COLS)
      .eq('journey_id', params.id)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (sErr) throw sErr

    return NextResponse.json({ profile: profile ?? null, sessions: sessions ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return errorResponse(m)
    }
    return errorResponse(e)
  }
}
