import { makeModulePermissions } from '@/lib/permissions/module-factory'
import type { Scope } from '@/lib/permissions/scope'

// Права модуля «finance». Логика — общая фабрика makeModulePermissions
// (см. lib/permissions/module-factory.ts). Публичный API (имена функций и
// сигнатуры) сохранён 1:1, поэтому вызывающий код не меняется.

export type FinancePrivilege =
  | 'view'
  | 'create_invoice'
  | 'approve_payment'
  | 'manage_budget'
  | 'export_reports'
  // Узкое право «итоги студентки» (начислено/оплачено/долг) БЕЗ доступа к
  // финмодулю — для ролей вроде «אחראית יהדות» (решение владельца).
  | 'view_student_balance'
  // Judaism module Phase 3 (spec §3.9 / §2.3) — governance of the manual tuition-
  // discount approval + payment confirmation. NOT auto-granted: the owner assigns
  // the finance role later (§6.2 open). See 20260903130000_tuition_settings_and_discounts.
  | 'approve_discount'
  | 'confirm_payment'
export type { Scope }

const perms = makeModulePermissions<FinancePrivilege>('finance')

export const hasFinancePrivilege = perms.hasPrivilege
export const getFinancePrivilegeScope = perms.getPrivilegeScope
export const requireFinancePrivilege = perms.requirePrivilege
export const clearFinancePermissionsCache = perms.clearCache
