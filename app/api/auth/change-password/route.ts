import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { verifyPassword, hashPassword } from '@/lib/auth/password'

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const { current_password, new_password } = await request.json() as {
      current_password: string
      new_password: string
    }

    if (!current_password || !new_password)
      return apiError('all_fields_required', 400)
    if (new_password.length < 8)
      return apiError('new_password_min_8', 400)

    const sb = createServerClient()
    const { data: account, error: e1 } = await sb
      .from('person_accounts')
      .select('id, password_hash')
      .eq('login_email', session.login_email)
      .single()
    if (e1 || !account) return apiError('account_not_found', 404)

    if (!account.password_hash) return apiError('account_not_found', 404)
    const valid = await verifyPassword(current_password, account.password_hash)
    if (!valid) return apiError('invalid_current_password', 400)

    const password_hash = await hashPassword(new_password)
    const { error: e2 } = await sb
      .from('person_accounts')
      .update({ password_hash })
      .eq('id', account.id)
    if (e2) throw e2

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: 500 })
  }
}
