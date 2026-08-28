import { makeModulePermissions } from '@/lib/permissions/module-factory'
import type { Scope } from '@/lib/permissions/scope'

// Права модуля «contacts». Логика — общая фабрика makeModulePermissions
// (см. lib/permissions/module-factory.ts). Публичный API (имена функций и
// сигнатуры) сохранён 1:1, поэтому вызывающий код не меняется.

export type ContactsPrivilege = 'view' | 'manage'
export type { Scope }

const perms = makeModulePermissions<ContactsPrivilege>('contacts')

export const hasContactsPrivilege = perms.hasPrivilege
export const getContactsPrivilegeScope = perms.getPrivilegeScope
export const requireContactsPrivilege = perms.requirePrivilege
export const clearContactsPermissionsCache = perms.clearCache
