import { makeModulePermissions } from '@/lib/permissions/module-factory'
import type { Scope } from '@/lib/permissions/scope'

// Права модуля «persons». Логика — общая фабрика makeModulePermissions
// (см. lib/permissions/module-factory.ts). Публичный API (имена функций и
// сигнатуры) сохранён 1:1, поэтому вызывающий код не меняется.

export type PersonsPrivilege = 'view' | 'manage' | 'view_sensitive'
export type { Scope }

const perms = makeModulePermissions<PersonsPrivilege>('persons')

export const hasPersonsPrivilege = perms.hasPrivilege
export const getPersonsPrivilegeScope = perms.getPrivilegeScope
export const requirePersonsPrivilege = perms.requirePrivilege
export const clearPersonsPermissionsCache = perms.clearCache
