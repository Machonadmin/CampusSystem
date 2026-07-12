import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { verifyPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body as { email?: string; password?: string }

    if (!email || !password) {
      return apiError('email_password_required', 400)
    }

    const supabase = createServerClient()
    const normalizedEmail = email.toLowerCase().trim()

    // 1. Fetch the account record
    const { data: account, error: accountError } = await supabase
      .from('person_accounts')
      .select('person_id, login_email, password_hash, is_active')
      .eq('login_email', normalizedEmail)
      .single()

    if (accountError) {
      return apiError('invalid_credentials', 401)
    }

    if (!account) {
      return apiError('invalid_credentials', 401)
    }

    if (!account.is_active) {
      return apiError('account_locked', 403)
    }

    if (!account.password_hash) {
      return apiError('invalid_credentials', 401)
    }

    const passwordValid = await verifyPassword(password, account.password_hash)

    if (!passwordValid) {
      return apiError('invalid_credentials', 401)
    }

    // 2. Fetch person's full name
    const { data: person } = await supabase
      .from('persons')
      .select('full_name')
      .eq('id', account.person_id)
      .single()

    // 3. Fetch assigned role ids, then look up role codes
    const { data: personRoleRows } = await supabase
      .from('person_roles')
      .select('role_id')
      .eq('person_id', account.person_id)

    const roleIds = (personRoleRows ?? []).map(r => r.role_id)

    const roles: string[] = []
    if (roleIds.length > 0) {
      const { data: roleRows } = await supabase
        .from('roles')
        .select('code')
        .in('id', roleIds)
      roleRows?.forEach(r => roles.push(r.code))
    }

    await createSession({
      person_id: account.person_id,
      login_email: account.login_email,
      full_name: person?.full_name ?? null,
      roles,
    })

    // Record login timestamp (fire-and-forget)
    supabase
      .from('person_accounts')
      .update({ last_login: new Date().toISOString() })
      .eq('person_id', account.person_id)
      .then()

    return NextResponse.json({
      person_id: account.person_id,
      login_email: account.login_email,
      full_name: person?.full_name ?? null,
      roles,
    })
  } catch (err) {
    console.error('[login] unhandled exception:', err)
    return apiError('internal_error', 500)
  }
}
