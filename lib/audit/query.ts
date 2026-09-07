/**
 * Разбор query-параметров журнала аудита (`audit_log`). Чистые функции без
 * React/DOM/БД — просто и тестируемо. Всё, что не прошло валидацию, становится
 * null (фильтр не применяется), а не 400: журнал только читается, и «мусорный»
 * параметр не должен ронять экран.
 */

/** Таблицы, на которые установлен триггер аудита (миграции 20260702170000 + 20260703140000). */
export const AUDITED_ENTITY_TYPES = [
  'persons',
  'education_journeys',
  'role_privileges',
  'person_privileges',
  'staff_positions',
  'staff_profiles',
  'process_instances',
  'stage_instances',
] as const

export const AUDIT_ACTIONS = ['create', 'update', 'delete'] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export const AUDIT_PAGE_SIZE_DEFAULT = 50
export const AUDIT_PAGE_SIZE_MAX = 200

export interface AuditQuery {
  entityType: string | null
  entityId: string | null
  changedBy: string | null
  action: AuditAction | null
  /** Границы по changed_at, включительно, в формате YYYY-MM-DD. */
  from: string | null
  to: string | null
  limit: number
  offset: number
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isUuid(v: string | null | undefined): boolean {
  return !!v && UUID_RE.test(v)
}

export function isIsoDate(v: string | null | undefined): boolean {
  if (!v || !DATE_RE.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

function clampInt(raw: string | null | undefined, def: number, min: number, max: number): number {
  const n = Number(raw)
  if (!raw || !Number.isFinite(n) || !Number.isInteger(n)) return def
  return Math.min(max, Math.max(min, n))
}

export function parseAuditQuery(get: (key: string) => string | null | undefined): AuditQuery {
  const entityType = (get('entity_type') || '').trim() || null
  const entityIdRaw = (get('entity_id') || '').trim()
  const changedByRaw = (get('changed_by') || '').trim()
  const actionRaw = (get('action') || '').trim()
  const fromRaw = (get('from') || '').trim()
  const toRaw = (get('to') || '').trim()

  return {
    entityType,
    entityId: isUuid(entityIdRaw) ? entityIdRaw : null,
    changedBy: isUuid(changedByRaw) ? changedByRaw : null,
    action: (AUDIT_ACTIONS as readonly string[]).includes(actionRaw) ? (actionRaw as AuditAction) : null,
    from: isIsoDate(fromRaw) ? fromRaw : null,
    to: isIsoDate(toRaw) ? toRaw : null,
    limit: clampInt(get('limit'), AUDIT_PAGE_SIZE_DEFAULT, 1, AUDIT_PAGE_SIZE_MAX),
    offset: clampInt(get('offset'), 0, 0, Number.MAX_SAFE_INTEGER),
  }
}

/**
 * Пары «поле: было → стало» для раскрытой строки. Берём changed_fields (что
 * реально изменилось), а значения — из old_data/new_data. Для create/delete
 * changed_fields пуст — показываем весь набор из new_data/old_data.
 */
export interface AuditDiffEntry { field: string; before: unknown; after: unknown }

export function buildAuditDiff(row: {
  action: string
  old_data: unknown
  new_data: unknown
  changed_fields: string[] | null
}): AuditDiffEntry[] {
  const oldObj = (row.old_data && typeof row.old_data === 'object' ? row.old_data : {}) as Record<string, unknown>
  const newObj = (row.new_data && typeof row.new_data === 'object' ? row.new_data : {}) as Record<string, unknown>

  const fields = row.changed_fields && row.changed_fields.length > 0
    ? row.changed_fields
    : [...new Set([...Object.keys(oldObj), ...Object.keys(newObj)])].sort()

  return fields.map(field => ({
    field,
    before: oldObj[field] ?? null,
    after: newObj[field] ?? null,
  }))
}
