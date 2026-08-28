import { makeModulePermissions } from '@/lib/permissions/module-factory'
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
