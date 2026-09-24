// ─── Правка: отправлять только то, что человек изменил ───────────────────────
//
// Формы «עריכת נושא» и «עריכת יחידה» раньше слали все поля разом, причём
// поля RU/EN открывались пустыми — и сохранение стирало существующие переводы.
// PATCH-маршруты и так обновляют только присланные поля; значит, достаточно не
// присылать нетронутые. Сравнение — по обрезанным пробелам: сервер всё равно
// их обрезает, и «добавил пробел в конце» правкой не считается.

export function changedFields<T extends Record<string, string>>(
  initial: T,
  current: T,
): Partial<T> {
  const out: Partial<T> = {}
  for (const key of Object.keys(current) as (keyof T)[]) {
    if ((current[key] ?? '').trim() !== (initial[key] ?? '').trim()) out[key] = current[key]
  }
  return out
}
