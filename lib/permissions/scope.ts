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

/**
 * Накладывает персональные привилегии (person_privileges) поверх ролевых.
 *   - is_granted=false → явный ЗАПРЕТ: привилегия удаляется, даже если её дала роль.
 *   - is_granted=true  → выдаёт привилегию как минимум в scope='department'
 *                        (личная выдача действует в подразделениях человека;
 *                        если роль уже дала 'all' — оставляем 'all').
 * Чистая функция — вход/выход только данные, чтобы легко тестировать. Вызов
 * фильтрует истёкшие (expires_at) ДО передачи сюда.
 */
export function applyPersonGrants<P extends string>(
  base: Partial<Record<P, Scope>>,
  grants: { code: string; is_granted: boolean }[],
): Partial<Record<P, Scope>> {
  const out: Partial<Record<P, Scope>> = { ...base }
  for (const g of grants) {
    const code = g.code as P
    if (!g.is_granted) { delete out[code]; continue }
    if (out[code] !== 'all') out[code] = 'department'
  }
  return out
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

/** Ребро дерева подразделений: узел и его родитель (или null для корня). */
export interface DepartmentEdge {
  id: string
  parent_id: string | null
}

/**
 * Иерархический scope: расширяет набор ПРЯМО назначенных подразделений вниз по
 * дереву `departments.parent_id` — к каждому корню добавляются ВСЕ его потомки
 * (рекурсивно), чтобы менеджер верхнего узла автоматически видел под-единицы.
 *
 * Свойства (важно для безопасности): добавляются ТОЛЬКО потомки корней — ничего
 * «вбок» или «вверх». Циклобезопасно (visited-множество). Возвращает
 * уникальный набор id (корни включены).
 */
export function expandDepartmentTree(rootIds: string[], edges: DepartmentEdge[]): string[] {
  const childrenByParent = new Map<string, string[]>()
  for (const e of edges) {
    if (e.parent_id) {
      const arr = childrenByParent.get(e.parent_id)
      if (arr) arr.push(e.id)
      else childrenByParent.set(e.parent_id, [e.id])
    }
  }
  const result = new Set<string>()
  const stack = [...rootIds]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (result.has(id)) continue
    result.add(id)
    const children = childrenByParent.get(id)
    if (children) for (const c of children) if (!result.has(c)) stack.push(c)
  }
  return Array.from(result)
}
