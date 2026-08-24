import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { isMissingRelation } from '@/lib/supabase/errors'
import { getSession } from '@/lib/auth/session'

/**
 * GET /api/auth/password-status → { must_change: boolean }
 * Нужно ли текущему пользователю сменить временный пароль. Staff читает
 * person_accounts, студентка — student_credentials. Deploy-safe: нет колонки
 * (42703) / нет таблицы (42P01) → { must_change: false } (никого не блокируем).
 */

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ must_change: false })
    const sb = createServerClient()
    try {
      if (session.principal === 'student' && session.student_journey_id) {
        const { data } = await sb.from('student_credentials')
          .select('must_change_password').eq('journey_id', session.student_journey_id).maybeSingle()
        return NextResponse.json({ must_change: !!(data as { must_change_password?: boolean } | null)?.must_change_password })
      }
      const { data } = await sb.from('person_accounts')
        .select('must_change_password').eq('login_email', session.login_email).maybeSingle()
      return NextResponse.json({ must_change: !!(data as { must_change_password?: boolean } | null)?.must_change_password })
    } catch (e) {
      if (isMissingRelation(e)) return NextResponse.json({ must_change: false })
      throw e
    }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: 500 })
  }
}
