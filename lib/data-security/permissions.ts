import { makeModulePermissions } from '@/lib/permissions/module-factory'
import type { SessionPayload } from '@/lib/auth/jwt'
import type { Scope } from '@/lib/permissions/scope'

// Права модуля «Безопасность данных» — общая фабрика makeModulePermissions,
// как у всех остальных модулей.
//
//   access      — войти в модуль и видеть, кто что видит (только чтение);
//   grant       — открывать и закрывать права сотруднику;
//   manage_tree — перестраивать дерево отображения (перетаскивание, вынос
//                 темы в отдельный модуль). Права при этом не меняются.
//
// Права разделены намеренно: 'grant' — сильнейшее право в системе (его
// держатель может открыть себе что угодно), а 'manage_tree' безопасно, потому
// что меняет только показ. Их нельзя было склеить в одно.

export type DataSecurityPrivilege = 'access' | 'grant' | 'manage_tree'
export type { Scope }

const perms = makeModulePermissions<DataSecurityPrivilege>('data_security')

export const hasDataSecurityPrivilege = perms.hasPrivilege
export const requireDataSecurityPrivilege = perms.requirePrivilege
export const clearDataSecurityPermissionsCache = perms.clearCache

/**
 * Что сессия может делать в модуле. Считается один раз на сервере и передаётся
 * на клиент, чтобы экран не решал это сам (и не мог ошибиться в свою пользу).
 */
export interface DataSecurityAbilities {
  canView: boolean
  canGrant: boolean
  canManageTree: boolean
}

export async function getDataSecurityAbilities(
  session: SessionPayload | null,
): Promise<DataSecurityAbilities> {
  if (!session) return { canView: false, canGrant: false, canManageTree: false }
  const [canView, canGrant, canManageTree] = await Promise.all([
    hasDataSecurityPrivilege(session, 'access'),
    hasDataSecurityPrivilege(session, 'grant'),
    hasDataSecurityPrivilege(session, 'manage_tree'),
  ])
  return { canView, canGrant, canManageTree }
}
