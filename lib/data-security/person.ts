import { reduceScopes, applyPersonGrants, type Scope } from '@/lib/permissions/scope'
import { privilegeKey } from './tree'

// ─── Что у сотрудника открыто на самом деле ──────────────────────────────────
//
// Экран «по сотруднику» обязан показывать ровно то, что происходит при реальном
// запросе. Поэтому здесь НЕ пишется своя логика: берутся те же самые
// reduceScopes и applyPersonGrants, которыми пользуется lib/permissions/
// module-factory.ts при каждой проверке доступа. Если правило выдачи изменится,
// экран изменится вместе с ним и разойтись с проверкой не сможет.
//
// Сверх «есть/нет» экран показывает ИСТОЧНИК: пришло право от должности,
// открыто лично, закрыто лично или временно. Без источника администратор видит
// галочку и не понимает, почему она стоит и что будет, если сменить должность.

export type PrivilegeSource =
  /** Право даёт роль (должность) и лично его не трогали. */
  | 'role'
  /** Право открыто лично этому человеку. */
  | 'personal_grant'
  /** Роль право давала, но лично оно закрыто — запрет сильнее роли. */
  | 'personal_deny'
  /** Личный запрет на право, которого роль и так не давала: ни на что не влияет. */
  | 'personal_deny_noop'

export interface RolePrivilegeInput {
  module: string
  privilege_code: string
  scope: string
}

export interface PersonPrivilegeInput {
  module: string
  privilege_code: string
  is_granted: boolean
  expires_at: string | null
}

export interface ResolvedPrivilege {
  module: string
  code: string
  /** Открыто ли право по итогу всех правил. */
  granted: boolean
  source: PrivilegeSource
  /** Область действия; null у закрытых прав. */
  scope: Scope | null
  /** Срок личной выдачи, если он задан. */
  expiresAt: string | null
  /** Личный оверрайд истёк и уже не действует — строка остаётся для истории. */
  expired: boolean
}

/**
 * Итоговые права человека по каждому модулю.
 *
 * Просроченные личные строки не влияют на результат (как и в проверках), но
 * возвращаются с expired = true: администратор должен видеть, что выдача была
 * и когда она кончилась, иначе «у него же был доступ» превращается в загадку.
 */
export function resolvePersonPrivileges(
  rolePrivileges: readonly RolePrivilegeInput[],
  personPrivileges: readonly PersonPrivilegeInput[],
  nowMs: number,
): ResolvedPrivilege[] {
  const modules = new Set<string>([
    ...rolePrivileges.map(r => r.module),
    ...personPrivileges.map(p => p.module),
  ])

  const out: ResolvedPrivilege[] = []

  for (const module of modules) {
    const roleRows = rolePrivileges.filter(r => r.module === module)
    const personRows = personPrivileges.filter(p => p.module === module)

    const live = personRows.filter(p => !p.expires_at || new Date(p.expires_at).getTime() > nowMs)
    const expired = personRows.filter(p => p.expires_at && new Date(p.expires_at).getTime() <= nowMs)

    // Ровно та же пара функций, что и в module-factory при проверке доступа.
    const fromRoles = reduceScopes(roleRows)
    const effective = applyPersonGrants(fromRoles, live.map(p => ({ code: p.privilege_code, is_granted: p.is_granted })))

    const roleCodes = new Set(roleRows.map(r => r.privilege_code))
    const liveByCode = new Map(live.map(p => [p.privilege_code, p]))

    // Только роли и ДЕЙСТВУЮЩИЕ личные строки: код, у которого осталась одна
    // лишь просроченная строка, попадёт ниже в блок истории. Если брать сюда
    // personRows целиком, такой код показался бы действующим с expired = false.
    const codes = new Set<string>([
      ...roleCodes,
      ...live.map(p => p.privilege_code),
    ])

    for (const code of codes) {
      const personal = liveByCode.get(code)
      const scope = effective[code] ?? null
      const granted = scope !== null

      let source: PrivilegeSource
      if (personal?.is_granted) source = 'personal_grant'
      else if (personal && !personal.is_granted) source = roleCodes.has(code) ? 'personal_deny' : 'personal_deny_noop'
      else source = 'role'

      out.push({
        module, code, granted, source, scope,
        expiresAt: personal?.expires_at ?? null,
        expired: false,
      })
    }

    // Истёкшие личные строки — только для истории, на granted не влияют.
    for (const p of expired) {
      if (codes.has(p.privilege_code)) continue
      out.push({
        module, code: p.privilege_code,
        granted: false,
        source: p.is_granted ? 'personal_grant' : 'personal_deny_noop',
        scope: null,
        expiresAt: p.expires_at,
        expired: true,
      })
    }
  }

  return out.sort((a, b) => a.module.localeCompare(b.module) || a.code.localeCompare(b.code))
}

/** Быстрый доступ по ключу права — экран раскладывает результат по дереву. */
export function indexByPrivilege(
  resolved: readonly ResolvedPrivilege[],
): Map<string, ResolvedPrivilege> {
  return new Map(resolved.map(r => [privilegeKey(r.module, r.code), r]))
}
