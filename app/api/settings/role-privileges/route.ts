import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { errorResponse } from '@/lib/api/handler'

async function guard() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error(serverT('forbidden')), { status: 403 })
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
    return errorResponse(e)
  }
}

// PUT — БЫВШАЯ правка прав должности. Решение владельца: права редактируются
// ТОЛЬКО в «אבטחת מידע», а с 17.09 у должностей вообще нет прав (только личные
// выдачи). Ни один экран этот PUT больше не вызывает; отвечаем 410 Gone, как
// /api/settings/person-privileges, чтобы старая вкладка/скрипт не писали в обход.
export async function PUT() {
  try {
    await guard()
    return apiError('person_privileges_moved', 410, { redirect_to: '/dashboard/data-security' })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
