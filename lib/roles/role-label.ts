/**
 * Локализованное имя роли по её коду.
 *
 * Источник перевода — общий словарь ролей translations.ts (доступен как
 * `useLang().t.roles`), где ключ = стабильный код роли. Для КАСТОМНЫХ ролей,
 * созданных в UI (код отсутствует в словаре), откатываемся к сохранённому в БД
 * имени. Так системные роли (в т.ч. руководящие) везде показываются на языке
 * интерфейса, а произвольные — как их назвали.
 */
export type RolesMap = Record<string, string>

export function roleLabel(
  rolesMap: RolesMap,
  code: string | null | undefined,
  fallback?: string | null,
): string {
  if (code && rolesMap[code]) return rolesMap[code]
  return (fallback && fallback.trim()) || code || ''
}
