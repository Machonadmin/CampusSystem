const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Разбор необязательного UUID-поля из тела запроса (subject_id / teacher_id
 * слота расписания).
 *
 * Три исхода, и их важно различать:
 *   • поле НЕ прислано (undefined)  → { provided: false } — не трогаем колонку;
 *   • прислан null / '' / '  '      → { provided: true, value: null } — очистить
 *     («наследовать от группы»);
 *   • прислан корректный UUID       → { provided: true, value: '<uuid>' }.
 * Мусор (не UUID, число, объект) → { ok: false }: вызывающий отвечает 400 ДО
 * обращения к БД, иначе Postgres вернул бы 22P02 и роут отдал бы 400 с куда
 * менее понятным текстом.
 */
export type OptionalUuid =
  | { ok: false }
  | { ok: true; provided: false }
  | { ok: true; provided: true; value: string | null }

export function parseOptionalUuid(raw: unknown): OptionalUuid {
  if (raw === undefined) return { ok: true, provided: false }
  if (raw === null) return { ok: true, provided: true, value: null }
  if (typeof raw !== 'string') return { ok: false }
  const v = raw.trim()
  if (v === '') return { ok: true, provided: true, value: null }
  return UUID_RE.test(v) ? { ok: true, provided: true, value: v } : { ok: false }
}

/**
 * ДЕЙСТВУЮЩИЕ преподаватели слота: собственный teacher_id слота, иначе (NULL)
 * весь список преподавателей группы.
 *
 * Единственное определение на весь проект — им пользуются и вывод сетки, и
 * поиск двойного бронирования, и признак «תפוס» в пикере. Если развести их,
 * экран покажет одного преподавателя, а конфликт посчитается по всей группе.
 */
export function effectiveTeacherIds(
  slotTeacherId: string | null | undefined,
  groupTeacherIds: readonly string[],
): string[] {
  return slotTeacherId ? [slotTeacherId] : [...groupTeacherIds]
}
