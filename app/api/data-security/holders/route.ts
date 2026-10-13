import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { getCookieLocale } from '@/lib/i18n/locale'
import {
  requireDataSecurityPrivilege, hasDataSecurityPrivilege, clearDataSecurityPermissionsCache,
} from '@/lib/data-security/permissions'
import { loadPrivilegeHolders } from '@/lib/data-security/load'
import { createServerClient } from '@/lib/supabase/server'
import type { PrivilegeModule } from '@/types/database'
import { errorResponse } from '@/lib/api/handler'

/**
 * Кто сейчас держит конкретное право — для карточки права на общем экране.
 *
 * Отвечает подписями должностей и именами людей, а не техническими кодами:
 * администратор решает «кому это открыто», и список кодов ему не помогает.
 * can_revoke — показывать ли крестики (право data_security.grant).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireDataSecurityPrivilege('access')
    // Имя 'module' занято бандлером Next — отсюда moduleCode.
    const moduleCode = request.nextUrl.searchParams.get('module')
    const code = request.nextUrl.searchParams.get('code')
    if (!moduleCode || !code) return apiError('invalid_reference', 400)
    const holders = await loadPrivilegeHolders(moduleCode, code, getCookieLocale())
    return NextResponse.json({ ...holders, can_revoke: await hasDataSecurityPrivilege(session, 'grant') })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}

/**
 * DELETE /api/data-security/holders — снять право прямо из карточки права
 * (крестик у имени, запрос владельца 2026-10-13).
 *   { module, code, person_id } — снимает ЛИЧНУЮ выдачу этому человеку;
 *   { module, code, role_id }   — снимает право с роли, то есть со всех, кто в ней.
 * Право: data_security.grant, как у любой выдачи на экране человека. Свою
 * выдачу держатель grant не снимает (это делает другой администратор), роль
 * superadmin не трогается: её строки ни на что не влияют.
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireDataSecurityPrivilege('grant')
    let body: { module?: unknown; code?: unknown; person_id?: unknown; role_id?: unknown }
    try { body = await request.json() } catch { return apiError('invalid_reference', 400) }
    const moduleCode = typeof body.module === 'string' ? body.module : ''
    const code = typeof body.code === 'string' ? body.code : ''
    const personId = typeof body.person_id === 'string' ? body.person_id : ''
    const roleId = typeof body.role_id === 'string' ? body.role_id : ''
    if (!moduleCode || !code || (!personId === !roleId)) return apiError('invalid_reference', 400)

    // Автор изменения уходит в журнал изменений (см. createServerClient).
    const sb = createServerClient({ actorPersonId: session.person_id })

    if (personId) {
      if (!session.roles.includes('superadmin') && personId === session.person_id) {
        return apiError('cannot_change_own_privileges', 403)
      }
      const { error } = await sb
        .from('person_privileges')
        .delete()
        .eq('person_id', personId)
        .eq('module', moduleCode as PrivilegeModule)
        .eq('privilege_code', code)
        .eq('is_granted', true)
      if (error) throw error
      clearDataSecurityPermissionsCache(personId)
    } else {
      const { data: role, error: roleErr } = await sb.from('roles').select('code').eq('id', roleId).maybeSingle()
      if (roleErr) throw roleErr
      if (!role) return apiError('not_found', 404)
      if (role.code === 'superadmin') return apiError('forbidden', 403)
      const { error } = await sb
        .from('role_privileges')
        .delete()
        .eq('role_id', roleId)
        .eq('module', moduleCode as PrivilegeModule)
        .eq('privilege_code', code)
      if (error) throw error
      clearDataSecurityPermissionsCache()
    }

    const holders = await loadPrivilegeHolders(moduleCode, code, getCookieLocale())
    return NextResponse.json({ ...holders, can_revoke: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
