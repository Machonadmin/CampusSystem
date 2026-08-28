import { makeModulePermissions } from '@/lib/permissions/module-factory'
import type { Scope } from '@/lib/permissions/scope'

// Права модуля «maintenance». Логика — общая фабрика makeModulePermissions
// (см. lib/permissions/module-factory.ts). Публичный API (имена функций и
// сигнатуры) сохранён 1:1, поэтому вызывающий код не меняется.

export type MaintenancePrivilege = 'view' | 'manage'
export type { Scope }

const perms = makeModulePermissions<MaintenancePrivilege>('maintenance')

export const hasMaintenancePrivilege = perms.hasPrivilege
export const getMaintenancePrivilegeScope = perms.getPrivilegeScope
export const requireMaintenancePrivilege = perms.requirePrivilege
export const clearMaintenancePermissionsCache = perms.clearCache
