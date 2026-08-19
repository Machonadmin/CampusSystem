import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requirePsychologistPrivilege } from '@/lib/psychologist/permissions'
import { mapDbError } from '@/lib/psychologist/http'

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

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
