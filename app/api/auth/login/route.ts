import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { verifyLoginPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'
import { isKodeshDepartmentWorkspace } from '@/lib/education/kodesh-workspace'
import { throttleAuth } from '@/lib/auth/login-throttle'
import type { SessionPayload } from '@/lib/auth/jwt'

export async function POST(request: NextRequest) {
  try {
    const throttled = throttleAuth(request, 'auth-login')
    if (throttled) return throttled

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

    // Пароль проверяем ДО любых других ответов и одинаково по времени для
    // любого адреса (verifyLoginPassword). «Аккаунт заблокирован» говорим только
    // тому, кто ввёл верный пароль, — иначе по этому ответу можно было бы
    // узнать, что такой адрес в системе существует.
    const found = accountError ? null : account
    const passwordValid = await verifyLoginPassword(password, found?.password_hash)

    if (!found || !passwordValid) {
      return apiError('invalid_credentials', 401)
    }

    if (!found.is_active) {
      return apiError('account_locked', 403)
    }

    // 2. Fetch person's full name
    const { data: person } = await supabase
      .from('persons')
      .select('full_name')
      .eq('id', found.person_id)
      .single()

    // 3. Fetch assigned role ids, then look up role codes
    const { data: personRoleRows } = await supabase
      .from('person_roles')
      .select('role_id')
      .eq('person_id', found.person_id)

    const roleIds = (personRoleRows ?? []).map(r => r.role_id)

    const roles: string[] = []
    if (roleIds.length > 0) {
      const { data: roleRows } = await supabase
        .from('roles')
        .select('code')
        .in('id', roleIds)
      roleRows?.forEach(r => roles.push(r.code))
    }

    // Служебный read-only аккаунт (тестовый вход для Claude). Отдельным запросом:
    // до миграции 20260924100000 колонки нет — тогда ошибка и обычный вход.
    const { data: readOnlyRow, error: _readOnlyErr } = await supabase
      .from('person_accounts')
      .select('read_only')
      .eq('person_id', account.person_id)
      .eq('login_email', account.login_email)
      .maybeSingle()
    const readOnly = (readOnlyRow as { read_only?: boolean } | null)?.read_only === true

    await createSession({
      person_id: found.person_id,
      login_email: found.login_email,
      full_name: person?.full_name ?? null,
      roles,
      ...(readOnly ? { read_only: true } : {}),
    })

    // Посадка §10: управляющая кафедрой иудаики открывается сразу на дом иудаики.
    // Сигнал по данным (глава/делегат единицы иудаики и не более широкий админ),
    // НЕ по строке роли. Fail-safe: любая ошибка → обычная посадка на /dashboard.
    let kodeshHome = false
    try {
      kodeshHome = await isKodeshDepartmentWorkspace({
        person_id: found.person_id,
        roles,
        principal: 'staff',
      } as SessionPayload)
    } catch { /* тихо: посадка на общий /dashboard */ }

    // Record login timestamp (fire-and-forget)
    supabase
      .from('person_accounts')
      .update({ last_login: new Date().toISOString() })
      .eq('person_id', found.person_id)
      .then()

    return NextResponse.json({
      person_id: found.person_id,
      login_email: found.login_email,
      full_name: person?.full_name ?? null,
      roles,
      kodesh_home: kodeshHome,
    })
  } catch (err) {
    console.error('[login] unhandled exception:', err)
    return apiError('internal_error', 500)
  }
}
