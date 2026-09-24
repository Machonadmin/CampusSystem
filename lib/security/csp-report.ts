// ─── Сводка нарушений Content-Security-Policy ────────────────────────────────
//
// Политика CSP пока включена в режиме «только записывать»
// (Content-Security-Policy-Report-Only в next.config.js): браузер ничего не
// блокирует, но сообщает, что БЫЛО БЫ заблокировано. Эти сообщения приходят в
// /api/public/csp-report, а здесь сворачиваются в короткую сводку «что, где,
// сколько раз», чтобы через неделю-две решить, можно ли включать политику по-
// настоящему (или что в неё добавить).
//
// Сводка хранится в app_settings (ключ csp_reports) — без миграции. Адреса
// обрезаются до origin + path: query-строки (токены, id) не сохраняются.

export const CSP_REPORTS_KEY = 'csp_reports'
export const MAX_ENTRIES = 100

export interface CspViolation {
  /** Нарушенная директива, например script-src-elem. */
  directive: string
  /** Что было бы заблокировано: origin внешнего ресурса или inline/eval/data/blob. */
  blocked: string
  /** Страница, на которой это случилось (только путь). */
  page: string
  /** Файл, из которого шёл запрос (origin + path), если браузер его сообщил. */
  source?: string
}

export interface CspEntry extends CspViolation {
  count: number
  first_seen: string
  last_seen: string
}

const MAX_FIELD = 300

function clip(s: string): string {
  return s.length > MAX_FIELD ? s.slice(0, MAX_FIELD) : s
}

/** URL → origin + path (без query и hash); ключевые слова CSP — как есть. */
function stripUrl(raw: unknown, pathOnly = false): string {
  if (typeof raw !== 'string' || raw === '') return ''
  try {
    const u = new URL(raw)
    if (u.protocol === 'data:' || u.protocol === 'blob:') return u.protocol.slice(0, -1)
    return clip(pathOnly ? u.pathname : `${u.origin}${u.pathname}`)
  } catch {
    // 'inline', 'eval', 'self', 'wasm-eval' и т.п.
    return clip(raw.replace(/[?#].*$/, ''))
  }
}

/** Внешний ресурс важен до origin; путь внутри чужого сайта сводку только раздувает. */
function blockedKey(raw: unknown): string {
  const s = stripUrl(raw)
  try {
    return new URL(s).origin
  } catch {
    return s
  }
}

function one(r: Record<string, unknown>): CspViolation | null {
  const directive = String(r['effective-directive'] ?? r.effectiveDirective ?? r['violated-directive'] ?? '')
    .split(' ')[0]
  if (!directive) return null
  const v: CspViolation = {
    directive: clip(directive),
    blocked: blockedKey(r['blocked-uri'] ?? r.blockedURL) || 'unknown',
    page: stripUrl(r['document-uri'] ?? r.documentURL, true) || 'unknown',
  }
  const source = stripUrl(r['source-file'] ?? r.sourceFile)
  if (source) v.source = source
  return v
}

/**
 * Разбирает тело отчёта в обоих форматах браузеров:
 *   • report-uri:  {"csp-report": {...}}               (application/csp-report)
 *   • report-to:   [{type:"csp-violation", body:{...}}] (application/reports+json) — на будущее
 */
export function parseCspReports(body: unknown): CspViolation[] {
  const out: CspViolation[] = []
  const push = (r: unknown) => {
    if (!r || typeof r !== 'object') return
    const v = one(r as Record<string, unknown>)
    if (v) out.push(v)
  }
  if (Array.isArray(body)) {
    for (const item of body.slice(0, 20)) {
      const it = item as { type?: string; body?: unknown }
      if (it?.type === 'csp-violation') push(it.body)
    }
  } else if (body && typeof body === 'object' && 'csp-report' in body) {
    push((body as Record<string, unknown>)['csp-report'])
  }
  return out
}

export function violationKey(v: CspViolation): string {
  return `${v.directive}|${v.blocked}|${v.page}`
}

/** Добавить нарушения в сводку; самые давние записи вытесняются после MAX_ENTRIES. */
export function mergeCspEntries(list: CspEntry[], violations: CspViolation[], now = new Date()): CspEntry[] {
  const iso = now.toISOString()
  const byKey = new Map(list.map(e => [violationKey(e), { ...e }]))
  for (const v of violations) {
    const k = violationKey(v)
    const e = byKey.get(k)
    if (e) {
      e.count += 1
      e.last_seen = iso
      if (!e.source && v.source) e.source = v.source
    } else {
      byKey.set(k, { ...v, count: 1, first_seen: iso, last_seen: iso })
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.last_seen.localeCompare(a.last_seen))
    .slice(0, MAX_ENTRIES)
}
