/**
 * Единая проверка «relation/column ещё не мигрированы» для deploy-safe кода.
 *
 *   42P01 — undefined_table  (таблица ещё не создана миграцией)
 *   42703 — undefined_column (колонка ещё не добавлена миграцией)
 *
 * Раньше эта пара кодов проверялась вручную в сотнях мест (и трижды через
 * локальные Set). Теперь — один предикат, чтобы deploy-safe контракт был
 * greppable и тестируемым.
 */
export function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null | undefined)?.code
  return code === '42P01' || code === '42703'
}
