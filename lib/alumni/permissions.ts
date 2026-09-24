import { makeModulePermissions } from '@/lib/permissions/module-factory'
import type { Scope } from '@/lib/permissions/scope'

// Права модуля «alumni». Логика — общая фабрика makeModulePermissions
// (см. lib/permissions/module-factory.ts). Публичный API (имена функций и
// сигнатуры) сохранён 1:1, поэтому вызывающий код не меняется.

export type AlumniPrivilege = 'view' | 'manage'
export type { Scope }

const perms = makeModulePermissions<AlumniPrivilege>('alumni')

export const hasAlumniPrivilege = perms.hasPrivilege
export const getAlumniPrivilegeScope = perms.getPrivilegeScope
export const requireAlumniPrivilege = perms.requirePrivilege
export const clearAlumniPermissionsCache = perms.clearCache
