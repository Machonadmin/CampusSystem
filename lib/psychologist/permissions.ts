import { makeModulePermissions } from '@/lib/permissions/module-factory'
import type { Scope } from '@/lib/permissions/scope'

// Права модуля «psychologist». Логика — общая фабрика makeModulePermissions
// (см. lib/permissions/module-factory.ts). Публичный API (имена функций и
// сигнатуры) сохранён 1:1, поэтому вызывающий код не меняется.
// ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ О ПСИХИЧЕСКОМ ЗДОРОВЬЕ: каждый маршрут обязан проходить requirePsychologistPrivilege.

export type PsychologistPrivilege = 'view' | 'manage'
export type { Scope }

const perms = makeModulePermissions<PsychologistPrivilege>('psychologist')

export const hasPsychologistPrivilege = perms.hasPrivilege
export const getPsychologistPrivilegeScope = perms.getPrivilegeScope
export const requirePsychologistPrivilege = perms.requirePrivilege
export const clearPsychologistPermissionsCache = perms.clearCache
