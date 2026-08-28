import { makeModulePermissions } from '@/lib/permissions/module-factory'
import type { Scope } from '@/lib/permissions/scope'

// Права модуля «doctor». Логика — общая фабрика makeModulePermissions
// (см. lib/permissions/module-factory.ts). Публичный API (имена функций и
// сигнатуры) сохранён 1:1, поэтому вызывающий код не меняется.
// ЧУВСТВИТЕЛЬНЫЕ МЕДИЦИНСКИЕ ДАННЫЕ: каждый маршрут обязан проходить requireDoctorPrivilege.

export type DoctorPrivilege = 'view' | 'manage'
export type { Scope }

const perms = makeModulePermissions<DoctorPrivilege>('doctor')

export const hasDoctorPrivilege = perms.hasPrivilege
export const getDoctorPrivilegeScope = perms.getPrivilegeScope
export const requireDoctorPrivilege = perms.requirePrivilege
export const clearDoctorPermissionsCache = perms.clearCache
