import { makeModulePermissions } from '@/lib/permissions/module-factory'
import type { Scope } from '@/lib/permissions/scope'

// Права модуля «food». Логика — общая фабрика makeModulePermissions
// (см. lib/permissions/module-factory.ts). Публичный API (имена функций и
// сигнатуры) сохранён 1:1, поэтому вызывающий код не меняется.

export type FoodPrivilege = 'view' | 'manage'
export type { Scope }

const perms = makeModulePermissions<FoodPrivilege>('food')

export const hasFoodPrivilege = perms.hasPrivilege
export const getFoodPrivilegeScope = perms.getPrivilegeScope
export const requireFoodPrivilege = perms.requirePrivilege
export const clearFoodPermissionsCache = perms.clearCache
