import { makeModulePermissions } from '@/lib/permissions/module-factory'
import type { Scope } from '@/lib/permissions/scope'

// Права модуля «sponsors». Логика — общая фабрика makeModulePermissions
// (см. lib/permissions/module-factory.ts). Публичный API (имена функций и
// сигнатуры) сохранён 1:1, поэтому вызывающий код не меняется.

export type SponsorsPrivilege = 'view' | 'manage'
export type { Scope }

const perms = makeModulePermissions<SponsorsPrivilege>('sponsors')

export const hasSponsorsPrivilege = perms.hasPrivilege
export const getSponsorsPrivilegeScope = perms.getPrivilegeScope
export const requireSponsorsPrivilege = perms.requirePrivilege
export const clearSponsorsPermissionsCache = perms.clearCache
