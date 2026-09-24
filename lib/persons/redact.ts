// ─── Редакция чувствительных PII-полей персоны ───────────────────────────────
//
// QA FIX #4: паспорт/адрес/гражданство/семейное положение/дата рождения —
// чувствительные поля. Их видят только роли с привилегией
// 'persons.view_sensitive'. Всем остальным (у кого лишь 'persons.view') эти
// поля обнуляются перед отдачей чужой карточки.
//
// Чистая функция — легко тестируется без БД.

/**
 * Ключи чувствительных полей на УРОВНЕ БД-строки persons.
 * (В некоторых ответах nationality проксируется как `citizenship`, поэтому
 * редакцию применяем к исходной строке ДО построения ответа.)
 */
export const SENSITIVE_PERSON_FIELDS = [
  'passport_number',
  'address',
  'nationality',
  'marital_status',
  'birth_date',
] as const

/**
 * Возвращает копию строки персоны, где чувствительные поля обнулены, если у
 * вызывающего НЕТ привилегии видеть их. Если canSeeSensitive === true — строка
 * возвращается без изменений.
 *
 * Обнуляются только те из чувствительных полей, что реально присутствуют в
 * объекте (наличие проверяется через `in`), так что функция безопасна для
 * строк с любым подмножеством колонок.
 */
export function redactSensitivePerson<T extends Record<string, unknown>>(
  row: T,
  canSeeSensitive: boolean,
): T {
  if (canSeeSensitive) return row
  const redacted: Record<string, unknown> = { ...row }
  for (const field of SENSITIVE_PERSON_FIELDS) {
    if (field in redacted) redacted[field] = null
  }
  return redacted as T
}
