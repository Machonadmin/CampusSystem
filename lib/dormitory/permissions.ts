import { makeModulePermissions } from '@/lib/permissions/module-factory'
import type { Scope } from '@/lib/permissions/scope'

// Права модуля «dormitory». Логика — общая фабрика makeModulePermissions
// (см. lib/permissions/module-factory.ts). Публичный API (имена функций и
// сигнатуры) сохранён 1:1, поэтому вызывающий код не меняется.

export type DormitoryPrivilege = 'view' | 'manage'
export type { Scope }

const perms = makeModulePermissions<DormitoryPrivilege>('dormitory')

export const hasDormitoryPrivilege = perms.hasPrivilege
export const getDormitoryPrivilegeScope = perms.getPrivilegeScope
export const requireDormitoryPrivilege = perms.requirePrivilege
export const clearDormitoryPermissionsCache = perms.clearCache
