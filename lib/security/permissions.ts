import { makeModulePermissions } from '@/lib/permissions/module-factory'
import type { Scope } from '@/lib/permissions/scope'

// Права модуля «security». Логика — общая фабрика makeModulePermissions
// (см. lib/permissions/module-factory.ts). Публичный API (имена функций и
// сигнатуры) сохранён 1:1, поэтому вызывающий код не меняется.

export type SecurityPrivilege = 'view' | 'manage'
export type { Scope }

const perms = makeModulePermissions<SecurityPrivilege>('security')

export const hasSecurityPrivilege = perms.hasPrivilege
export const getSecurityPrivilegeScope = perms.getPrivilegeScope
export const requireSecurityPrivilege = perms.requirePrivilege
export const clearSecurityPermissionsCache = perms.clearCache
