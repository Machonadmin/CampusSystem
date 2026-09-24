/**
 * Единая проверка «relation/column ещё не мигрированы» для deploy-safe кода.
 *
 * Миграции применяются вручную, поэтому «таблицы/колонки ещё нет» — реальное
 * состояние прода между деплоем и запуском его миграции. Код должен в этот
 * момент деградировать (пустой ответ / 503 feature_not_migrated), а не падать.
 *
 * Коды, которые означают «ещё не мигрировано»:
 *   Postgres (SQLSTATE), когда запрос дошёл до БД:
 *     42P01 — undefined_table   (таблица ещё не создана миграцией)
 *     42703 — undefined_column  (колонка ещё не добавлена миграцией; в т.ч. в select)
 *   PostgREST (hosted Supabase, PostgREST ≥ 12), когда запрос отбит по schema cache
 *   ДО обращения к Postgres:
 *     PGRST205 — таблица не найдена в schema cache
 *     PGRST204 — колонка не найдена в schema cache (insert/update с неизвестной колонкой)
 *
 * Раньше пара 42P01/42703 проверялась вручную в сотнях мест и НЕ ловила коды
 * PostgREST — на hosted Supabase все такие гарды промахивались и маршруты
 * отдавали 500. Теперь — три предиката, чтобы контракт был greppable, тестируем
 * и единообразен. Принимают объект ошибки Supabase ({ code }) ИЛИ сам код строкой.
 */

type ErrorLike = string | { code?: string | null } | null | undefined

function codeOf(err: unknown): string | undefined {
  if (typeof err === 'string') return err
  const code = (err as { code?: unknown } | null | undefined)?.code
  return typeof code === 'string' ? code : undefined
}

/** Таблица ещё не создана: 42P01 (Postgres) или PGRST205 (PostgREST schema cache). */
export function isMissingTable(err: unknown): boolean {
  const code = codeOf(err as ErrorLike)
  return code === '42P01' || code === 'PGRST205'
}

/** Колонка ещё не добавлена: 42703 (Postgres) или PGRST204 (PostgREST schema cache). */
export function isMissingColumn(err: unknown): boolean {
  const code = codeOf(err as ErrorLike)
  return code === '42703' || code === 'PGRST204'
}

/** Таблица ИЛИ колонка ещё не мигрированы (объединение двух предикатов выше). */
export function isMissingRelation(err: unknown): boolean {
  return isMissingTable(err) || isMissingColumn(err)
}
