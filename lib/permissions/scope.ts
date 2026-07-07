// ─── Общий редьюсер scope для модульных прав ─────────────────────────────────
//
// Извлечено из модульных permissions.ts (alumni/education/…): по строкам
// (privilege_code, scope) из role_privileges собирает карту привилегия→scope,
// оставляя МАКСИМАЛЬНЫЙ scope (all > department > own), когда одна привилегия
// приходит от нескольких ролей с разным scope. Переиспользуется всеми
// модульными permissions-хелперами, чтобы правило слияния было единым.

export type Scope = 'all' | 'department' | 'own'

const SCOPE_RANK: Record<Scope, number> = { all: 3, department: 2, own: 1 }

/**
 * Сворачивает строки role_privileges в карту привилегия→максимальный scope.
 * Неизвестные значения scope игнорируются.
 */
export function reduceScopes<P extends string>(
  rows: { privilege_code: string; scope: string }[],
): Partial<Record<P, Scope>> {
  const result: Partial<Record<P, Scope>> = {}
  for (const row of rows) {
    const pc = row.privilege_code as P
    const sc = row.scope as Scope
    if (!(sc in SCOPE_RANK)) continue
    const existing = result[pc]
    if (!existing || SCOPE_RANK[sc] > SCOPE_RANK[existing]) {
      result[pc] = sc
    }
  }
  return result
}
