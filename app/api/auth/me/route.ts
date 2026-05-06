import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { createServerClient } from '@/lib/supabase/server'
import type { RoleCode } from '@/types/database'

const ALL_MODULE_CODES = [
  'persons', 'staff', 'quality_control', 'education', 'finance', 'dormitory', 'food',
  'security', 'alumni', 'sponsors', 'tasks', 'documents', 'reports',
  'contacts', 'settings', 'doctor', 'psychologist', 'maintenance',
]

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  let accessible_modules: string[]

  if (session.roles.includes('superadmin')) {
    accessible_modules = ALL_MODULE_CODES
  } else {
    const sb = createServerClient()
    const { data: roleRows } = await sb.from('roles').select('id').in('code', session.roles as RoleCode[])
    const roleIds = (roleRows ?? []).map(r => r.id)

    if (roleIds.length === 0) {
      accessible_modules = []
    } else {
      const { data: privs } = await sb
        .from('role_privileges')
        .select('module')
        .in('role_id', roleIds)
        .eq('privilege_code', 'access')
      accessible_modules = [...new Set((privs ?? []).map(p => p.module as string))]
    }
  }

  return NextResponse.json({
    person_id: session.person_id,
    login_email: session.login_email,
    full_name: session.full_name,
    roles: session.roles,
    accessible_modules,
  })
}
