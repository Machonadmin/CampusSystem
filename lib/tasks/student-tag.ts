/**
 * ─── Метка «תלמידה קשורה» на задаче ─────────────────────────────────────────
 *
 * Задачу можно привязать к конкретной תלמידה: тогда она видна в панели
 * «פתוח עכשיו» на карточке תלמידה, а в списке задач показывается чип с именем.
 *
 * ХРАНЕНИЕ: два ключа в tasks.metadata (JSONB) — student_person_id (persons.id)
 * и journey_id (education_journeys.id). Отдельной колонки нет по той же причине,
 * что и у метки эксплуатации (см. lib/tasks/maintenance-link.ts): миграции
 * владелец применяет вручную, а metadata есть с первого дня. Ключ journey_id —
 * тот же, что уже пишут автозадачи приёмной комиссии
 * (lib/workflow/acceptance-tasks.ts), поэтому поиск задач по תלמידה —
 * это один `.contains('metadata', { journey_id })`.
 *
 * Метка — ВСЕГДА пара. Один ключ без другого считается мусором и отбрасывается:
 * сервер обязан проверить, что journey принадлежит этому человеку, а без пары
 * проверять нечего.
 */

export const STUDENT_PERSON_KEY = 'student_person_id'
export const STUDENT_JOURNEY_KEY = 'journey_id'

export interface StudentTag {
  student_person_id: string
  journey_id: string
}

/** Канонический UUID (любая версия), как его отдаёт PostgREST. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

function asRecord(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  return v as Record<string, unknown>
}

/**
 * Достаёт метку из произвольного значения (тело запроса или metadata из БД).
 * null — если метки нет или она неполная / не UUID. UUID приводятся к нижнему
 * регистру: jsonb `@>` сравнивает строки точно, а PostgREST отдаёт id в нижнем.
 */
export function extractStudentTag(v: unknown): StudentTag | null {
  const r = asRecord(v)
  const pid = r[STUDENT_PERSON_KEY]
  const jid = r[STUDENT_JOURNEY_KEY]
  if (!isUuid(pid) || !isUuid(jid)) return null
  return { student_person_id: pid.toLowerCase(), journey_id: jid.toLowerCase() }
}

/**
 * Возвращает НОВЫЙ объект metadata с выставленной (tag) или снятой (null)
 * меткой. Прочие ключи (maintenance, source и т.п.) сохраняются.
 *
 * При снятии journey_id удаляется, только если задача НЕ автозадача приёмной
 * комиссии: у таких metadata.journey_id — служебная ссылка, по которой
 * lib/workflow/acceptance-tasks.ts находит и закрывает задачу.
 */
export function withStudentTag(metadata: unknown, tag: StudentTag | null): Record<string, unknown> {
  const next = { ...asRecord(metadata) }
  if (tag) {
    next[STUDENT_PERSON_KEY] = tag.student_person_id
    next[STUDENT_JOURNEY_KEY] = tag.journey_id
  } else {
    delete next[STUDENT_PERSON_KEY]
    if (next.source !== 'acceptance') delete next[STUDENT_JOURNEY_KEY]
  }
  return next
}

/** Автозадача приёмной комиссии — её journey_id менять нельзя (см. выше). */
export function isAcceptanceTask(metadata: unknown): boolean {
  return asRecord(metadata).source === 'acceptance'
}

/** Имя תלמידה для чипа: иврит, иначе полное имя. */
export function studentDisplayName(p: { full_name?: string | null; hebrew_name?: string | null } | null | undefined): string {
  return (p?.hebrew_name || p?.full_name || '').trim()
}

/** Ссылка на תלמידה, которую API задач добавляет к строке (для чипа). */
export interface TaskStudentRef {
  person_id: string
  journey_id: string
  name: string
}
