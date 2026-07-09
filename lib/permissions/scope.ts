// ─── Выбор максимального scope привилегии ────────────────────────────────────
//
// Общая чистая логика для всех модульных permissions-либ (education/alumni/
// finance): если одна привилегия выдана несколькими ролями с разным scope,
// берётся максимальный по приоритету all > department > own.

export type Scope = 'all' | 'department' | 'own'

const SCOPE_RANK: Record<Scope, number> = { all: 3, department: 2, own: 1 }

/**
 * Сворачивает строки role_privileges в карту privilege_code → максимальный scope.
 * Строки с неизвестным scope игнорируются. Обобщён по коду привилегии P.
 */
export function reduceScopes<P extends string>(
  rows: { privilege_code: string; scope: string }[],
): Partial<Record<P, Scope>> {
  const result: Partial<Record<P, Scope>> = {}
  for (const row of rows) {
    const sc = row.scope as Scope
    if (SCOPE_RANK[sc] === undefined) continue
    const pc = row.privilege_code as P
    const existing = result[pc]
    if (!existing || SCOPE_RANK[sc] > SCOPE_RANK[existing]) {
      result[pc] = sc
    }
  }
  return result
}

/** Что именно проверяем: подразделение действия и/или ответственные лица. */
export interface AccessTarget {
  department_id?: string
  teacher_ids?: string[]
}

/** Контекст пользователя: его подразделения и его person_id. */
export interface AccessContext {
  departmentIds: string[]
  personId: string
}

/**
 * Чистое решение доступа по scope и цели. Извлечено из hasEducationPrivilege
 * без изменения поведения:
 *   - нет scope        → нет доступа
 *   - all              → доступ всегда
 *   - department       → без target.department_id доступ разрешён (общий пул);
 *                        иначе подразделение должно быть у пользователя
 *   - own              → нужен непустой teacher_ids, и в нём должен быть personId
 */
export function grantsAccess(
  scope: Scope | undefined,
  target: AccessTarget | undefined,
  ctx: AccessContext,
): boolean {
  if (!scope) return false
  if (scope === 'all') return true
  if (scope === 'department') {
    if (!target?.department_id) return true
    return ctx.departmentIds.includes(target.department_id)
  }
  if (scope === 'own') {
    if (!target?.teacher_ids || target.teacher_ids.length === 0) return false
    return target.teacher_ids.includes(ctx.personId)
  }
  return false
}
