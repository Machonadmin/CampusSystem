// ─── Эксплуатация: заявки на обслуживание — чистая логика ────────────────────
//
// Никаких обращений к БД — только расчёты (SLA/просрочка, сортировка,
// валидность перехода статуса, агрегаты), поэтому логика целиком покрывается
// юнит-тестами (tickets.test.ts, vitest). Время — ISO-строки; разница берётся
// через Date.getTime().

// ─── SLA / просрочка ──────────────────────────────────────────────────────────

/**
 * Норматив реакции (SLA) в ЧАСАХ по приоритету. Заявка считается просроченной,
 * если она ещё в работе (open/in_progress) и её возраст в часах СТРОГО больше
 * норматива приоритета.
 */
export const SLA_HOURS = {
  urgent: 4,
  high: 24,
  normal: 72,
  low: 168,
} as const

export type Priority = keyof typeof SLA_HOURS

/**
 * Возраст заявки в целых часах: floor((now - reported) / час). Никогда не
 * отрицательный — если now раньше reported (рассинхрон часов / будущая дата),
 * возвращает 0.
 */
export function ticketAgeHours(reportedAtISO: string, nowISO: string): number {
  const ms = new Date(nowISO).getTime() - new Date(reportedAtISO).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.floor(ms / 3_600_000)
}

/**
 * Просрочена ли заявка. Только для активных статусов (open/in_progress) и
 * только если возраст СТРОГО превышает SLA приоритета (ровно на границе SLA —
 * ещё НЕ просрочена). Неизвестный приоритет (нет в SLA_HOURS) → не просрочена.
 */
export function isOverdue(
  t: { status: string; priority: string; reported_at: string },
  nowISO: string,
): boolean {
  if (t.status !== 'open' && t.status !== 'in_progress') return false
  const sla = SLA_HOURS[t.priority as Priority]
  if (sla === undefined) return false
  return ticketAgeHours(t.reported_at, nowISO) > sla
}

// ─── Сортировка ───────────────────────────────────────────────────────────────

/**
 * Ранг приоритета для сортировки (выше — важнее). Список заявок сортируется по
 * рангу приоритета убыв., затем по времени подачи (старые выше).
 */
export const PRIORITY_RANK = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
} as const

/** Ранг приоритета; неизвестный приоритет → 0 (уходит в самый низ). */
export function priorityRank(priority: string): number {
  return PRIORITY_RANK[priority as Priority] ?? 0
}

// ─── Машина статусов ──────────────────────────────────────────────────────────

/**
 * Разрешённые переходы статуса. closed и cancelled — терминальные (переходов
 * нет). Переход в тот же статус (from === to) запрещён.
 */
const TRANSITIONS: Record<string, readonly string[]> = {
  open:        ['in_progress', 'cancelled'],
  in_progress: ['resolved', 'cancelled', 'open'],
  resolved:    ['closed', 'in_progress'],
  closed:      [],
  cancelled:   [],
}

/** Можно ли перевести заявку из статуса from в статус to. */
export function canTransition(from: string, to: string): boolean {
  if (from === to) return false
  return (TRANSITIONS[from] ?? []).includes(to)
}

/** Список статусов, в которые можно перейти из from (для кнопок в UI). */
export function allowedTransitions(from: string): string[] {
  return [...(TRANSITIONS[from] ?? [])]
}

// ─── Агрегаты ─────────────────────────────────────────────────────────────────

/** Кол-во заявок по каждому статусу. Пустой список → {}. */
export function statusCounts(tickets: { status: string }[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const t of tickets) {
    counts[t.status] = (counts[t.status] ?? 0) + 1
  }
  return counts
}
