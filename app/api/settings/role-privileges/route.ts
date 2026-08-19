import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import type { PrivilegeModule } from '@/types/database'

async function guard() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('FORBIDDEN'), { status: 403 })
  return session
}

export async function GET(request: NextRequest) {
  try {
    await guard()
    const sb = createServerClient()
    const roleId = request.nextUrl.searchParams.get('role_id')

    const [{ data: modulePrivs }, { data: rolePrivs }] = await Promise.all([
      sb.from('module_privileges').select('*').order('module').order('sort_order'),
      roleId
        ? sb.from('role_privileges').select('*').eq('role_id', roleId)
        : Promise.resolve({ data: [] }),
    ])

    const allRolePrivs = rolePrivs ?? []
    return NextResponse.json({
      modulePrivileges: modulePrivs ?? [],
      rolePrivileges: allRolePrivs,
      accessPrivileges: allRolePrivs.filter(p => p.privilege_code === 'access'),
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

// PUT — replace all privileges for a role
export async function PUT(request: NextRequest) {
  try {
    const session = await guard()
    const sb = createServerClient()
    const { role_id, privileges } = await request.json() as {
      role_id: string
      privileges: { module: string; privilege_code: string }[]
    }

    // Сохраняем существующий scope каждой привилегии: колонка role_privileges.scope
    // имеет DEFAULT 'all', а UI шлёт только {module, privilege_code} без scope.
    // Без этого delete+insert молча повышал бы scope='department' → 'all' (доступ
    // ко всему кампусу) при любом сохранении роли — тихая эскалация прав.
    const { data: existing } = await sb
      .from('role_privileges')
      .select('module, privilege_code, scope')
      .eq('role_id', role_id)
    type Scope = 'all' | 'department' | 'own'
    const scopeByKey = new Map<string, Scope>(
      (existing ?? []).map(r => [`${r.module}::${r.privilege_code}`, r.scope as Scope]),
    )

    await sb.from('role_privileges').delete().eq('role_id', role_id)

    if (privileges.length > 0) {
      const { error } = await sb.from('role_privileges').insert(
        privileges.map(p => ({
          role_id,
          module: p.module as PrivilegeModule,
          privilege_code: p.privilege_code,
          granted_by: session.person_id,
          // существующим привилегиям — их прежний scope; новым — 'all' (как раньше).
          scope: scopeByKey.get(`${p.module}::${p.privilege_code}`) ?? ('all' as Scope),
        }))
      )
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
