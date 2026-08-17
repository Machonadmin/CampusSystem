import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hashPassword, passwordStrengthIssue } from '@/lib/auth/password'

/**
 * POST /api/auth/force-password-change  { new_password }  (STAFF)
 * Первая обязательная смена временного пароля. НЕ требует текущего пароля
 * (пользователь только что вошёл), но разрешена ТОЛЬКО когда стоит флаг
 * must_change_password — иначе это обычная смена через /api/auth/change-password.
 * Ставит новый хеш и снимает флаг.
 */
function u(sb: ReturnType<typeof createServerClient>) { return sb as unknown as SupabaseClient }

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const { new_password } = await request.json().catch(() => ({})) as { new_password?: string }
    const issue = passwordStrengthIssue(new_password ?? '')
    if (issue) return apiError(issue === 'too_short' ? 'new_password_min_8' : 'password_need_letter_and_digit', 400)

    const sb = createServerClient()
    const { data: account } = await u(sb).from('person_accounts')
      .select('id, must_change_password').eq('login_email', session.login_email).maybeSingle()
    if (!account) return apiError('account_not_found', 404)
    if (!(account as { must_change_password?: boolean }).must_change_password) return apiError('forbidden', 403)

    const password_hash = await hashPassword(new_password!)
    const { error } = await u(sb).from('person_accounts')
      .update({ password_hash, must_change_password: false }).eq('id', (account as { id: string }).id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: 500 })
  }
}
