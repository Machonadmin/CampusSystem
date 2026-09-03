/**
 * Обобщённая вкладка ↔ URL. Активная вкладка верхнего уровня (напр. צוות:
 * מבנה/צוות/תפקידים, בריאות: מרפאה/פסיכולוג) — это НАВИГАЦИЯ: пользователь в неё
 * заходит и ждёт, что браузерный «назад» вернёт на прежнюю вкладку, а ссылка/
 * обновление откроют ту же. Держим её в query (?tab=), каждый переход —
 * router.push (запись истории). Решение о значении вынесено в чистую функцию —
 * её легко тестировать (без React/DOM). Инкрементальные UI-состояния (раскрытая
 * строка, открытая модалка, свёрнутый рельс) сюда НЕ переносим.
 */

/**
 * Выбирает валидную вкладку из сырого значения query: сперва алиасы (старые
 * ссылки, напр. ?tab=users → 'staff'), затем список допустимых; иначе — fallback.
 */
export function parseTabParam<T extends string>(
  raw: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
  aliases?: Readonly<Record<string, T>>,
): T {
  if (raw == null || raw.length === 0) return fallback
  if (aliases && Object.prototype.hasOwnProperty.call(aliases, raw)) return aliases[raw]
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback
}

/**
 * Строит следующую строку query для перехода на вкладку, СОХРАНЯЯ прочие
 * параметры. Для вкладки-по-умолчанию ключ удаляется (чистый URL landing’а).
 * Чистая функция — возвращает готовую строку (без ведущего '?').
 */
export function buildTabQuery<T extends string>(
  base: URLSearchParams,
  key: string,
  next: T,
  fallback: T,
): string {
  const params = new URLSearchParams(base.toString())
  if (next === fallback) params.delete(key)
  else params.set(key, next)
  return params.toString()
}
