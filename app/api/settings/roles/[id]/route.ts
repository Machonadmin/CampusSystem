import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { normalizeRoleCode, roleCodeChangeError } from '@/lib/auth/reserved-roles'

async function guard() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error(serverT('forbidden')), { status: 403 })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await guard()
    const sb = createServerClient()
    const body = await request.json() as Record<string, unknown>

    // Renaming a role's code is guarded (see lib/auth/reserved-roles): a role can
    // neither be renamed TO a reserved code (it would inherit the hardcoded
    // behaviour) nor AWAY from one (every check looking for it would break —
    // e.g. renaming `superadmin` would lock every administrator out).
    // Fail-closed: if the current row cannot be read, nothing is updated.
    if (Object.prototype.hasOwnProperty.call(body, 'code')) {
      const { data: current, error: readErr } = await sb.from('roles')
        .select('code').eq('id', params.id).maybeSingle()
      if (readErr) throw readErr
      if (!current) return apiError('role_not_found', 404)
      const verdict = roleCodeChangeError(body.code, current.code)
      if (verdict) {
        // `reserved_code` names the code that caused the refusal: the requested
        // one (rename-to) or the current one (rename-away).
        const reservedCode = verdict === 'role_code_locked' ? current.code : body.code
        return apiError(verdict, 409, { reserved_code: normalizeRoleCode(reservedCode) })
      }
    }

    const { error } = await sb.from('roles').update(body).eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await guard()
    const sb = createServerClient()

    const { data: role } = await sb.from('roles').select('is_system').eq('id', params.id).maybeSingle()
    if (role?.is_system)
      return apiError('cannot_delete_system_role', 400)

    const { error } = await sb.from('roles').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
