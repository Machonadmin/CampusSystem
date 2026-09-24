import { makeModulePermissions } from '@/lib/permissions/module-factory'
import { getAccessibleModules } from '@/lib/permissions/module-access'
import { getSession } from '@/lib/auth/session'
import { serverT } from '@/lib/i18n/api-errors'
import type { Scope } from '@/lib/permissions/scope'

// Права модуля «reports». Логика — общая фабрика makeModulePermissions
// (см. lib/permissions/module-factory.ts). Публичный API (имена функций и
// сигнатуры) сохранён 1:1, поэтому вызывающий код не меняется.

export type ReportsPrivilege = 'view' | 'manage'
export type { Scope }

const perms = makeModulePermissions<ReportsPrivilege>('reports')

export const hasReportsPrivilege = perms.hasPrivilege
export const getReportsPrivilegeScope = perms.getPrivilegeScope
export const requireReportsPrivilege = perms.requirePrivilege
export const clearReportsPermissionsCache = perms.clearCache

/**
 * Отчёты фильтруются ПО РОЛИ (решение владельца): каждый отчёт принадлежит
 * модулю, и пользователь видит/читает только отчёты модулей, к которым у него
 * есть доступ (role_privileges access + личные оверрайды). superadmin — всё.
 * Кидает 403, если модуль отчёта пользователю недоступен. Вызывать ПОСЛЕ
 * requireReportsPrivilege('view') в каждом /api/reports/* роуте.
 */
export async function requireReportModule(module: string): Promise<void> {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  if (session.roles.includes('superadmin')) return
  const accessible = await getAccessibleModules(session)
  if (!accessible.includes(module)) {
    throw Object.assign(new Error(serverT('forbidden')), { status: 403 })
  }
}
