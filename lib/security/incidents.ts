// ─── Безопасность: инциденты — чистая логика ─────────────────────────────────
//
// Никаких обращений к БД — только сортировочный ранг серьёзности, машина
// статусов (валидность перехода) и агрегаты, поэтому логика целиком покрывается
// юнит-тестами (incidents.test.ts, vitest). Зеркалит подход lib/maintenance/tickets.ts.

// ─── Ранг серьёзности (severity) ──────────────────────────────────────────────

/**
 * Ранг серьёзности для сортировки (выше — важнее). Список инцидентов
 * сортируется по рангу серьёзности убыв., затем по времени происшествия
 * (свежие выше).
 */
export const SEVERITY_RANK = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
} as const

export type Severity = keyof typeof SEVERITY_RANK

/** Ранг серьёзности; неизвестная серьёзность → 0 (уходит в самый низ). */
export function severityRank(severity: string): number {
  return SEVERITY_RANK[severity as Severity] ?? 0
}

// ─── Машина статусов ──────────────────────────────────────────────────────────

/**
 * Разрешённые переходы статуса инцидента:
 *   open          → investigating | closed
 *   investigating → resolved | closed
 *   resolved      → closed | investigating (повторное открытие)
 *   closed        — терминальный (переходов нет)
 * Переход в тот же статус (from === to) запрещён.
 */
const TRANSITIONS: Record<string, readonly string[]> = {
  open:          ['investigating', 'closed'],
  investigating: ['resolved', 'closed'],
  resolved:      ['closed', 'investigating'],
  closed:        [],
}

/** Можно ли перевести инцидент из статуса from в статус to. */
export function canTransition(from: string, to: string): boolean {
  if (from === to) return false
  return (TRANSITIONS[from] ?? []).includes(to)
}

/** Список статусов, в которые можно перейти из from (для кнопок в UI). */
export function allowedTransitions(from: string): string[] {
  return [...(TRANSITIONS[from] ?? [])]
}

// ─── Агрегаты ─────────────────────────────────────────────────────────────────

export interface IncidentStats {
  total: number
  open: number
  investigating: number
  resolved: number
  closed: number
  /** активные = open + investigating (требуют внимания) */
  active: number
  /** число инцидентов по каждой серьёзности */
  by_severity: Record<string, number>
}

/**
 * Сводка по инцидентам: всего, по каждому статусу, активные (open +
 * investigating) и разбивка по серьёзности. Пустой список → нули и {}.
 */
export function incidentStats(incidents: { status: string; severity: string }[]): IncidentStats {
  const stats: Omit<IncidentStats, 'by_severity'> = {
    total: 0, open: 0, investigating: 0, resolved: 0, closed: 0, active: 0,
  }
  const by_severity: Record<string, number> = {}

  for (const i of incidents) {
    stats.total++
    if (i.status === 'open') stats.open++
    else if (i.status === 'investigating') stats.investigating++
    else if (i.status === 'resolved') stats.resolved++
    else if (i.status === 'closed') stats.closed++
    by_severity[i.severity] = (by_severity[i.severity] ?? 0) + 1
  }

  stats.active = stats.open + stats.investigating
  return { ...stats, by_severity }
}
