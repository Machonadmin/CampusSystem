import { createServerClient } from '@/lib/supabase/server'

type SB = ReturnType<typeof createServerClient>

/**
 * Академический календарь особых дней (ימים מיוחדים, spec §3.4 / §4.5). Каждый
 * особый день имеет ТИП (calendar_day_types), задающий, что он блокирует:
 *   • full_off    — нет ни светских, ни кодеша (blocks_secular + blocks_kodesh);
 *   • no_kodesh   — светские идут, кодеша нет (blocks_kodesh);
 *   • kodesh_only — только кодеш (blocks_secular);
 *   • shortened   — ничего не блокирует, но день укороченный (is_shortened).
 *
 * Порождение уроков решает ПО ВИДУ ГРУППЫ (кодеш vs светская), пропускать ли дату.
 * Тип по умолчанию 'full_off' → строки без типа (и до миграции) сохраняют прежний
 * смысл «нет уроков вообще».
 */

export const DEFAULT_DAY_TYPE = 'full_off'

export interface DayTypeFlags {
  blocks_secular: boolean
  blocks_kodesh: boolean
  is_shortened: boolean
}
export type GroupKind = 'kodesh' | 'secular'

/** Флаги для дня без типа / до миграции — как full_off (блокирует всё). */
export const FULL_OFF_FLAGS: DayTypeFlags = { blocks_secular: true, blocks_kodesh: true, is_shortened: false }

/**
 * Пропускать ли урок в этот день для группы данного вида. Чистая функция —
 * единственное место принятия решения (легко тестировать/менять).
 *   • кодеш-группа пропускает дату, чей тип blocks_kodesh; идёт на kodesh_only.
 *   • светская группа пропускает дату, чей тип blocks_secular; идёт на no_kodesh.
 *   • shortened (blocks nothing) — НЕ пропускает (укороченный, но урок есть).
 */
export function shouldSkipLesson(kind: GroupKind, flags: DayTypeFlags): boolean {
  return kind === 'kodesh' ? flags.blocks_kodesh : flags.blocks_secular
}

/** Объединение типов, если на одну дату несколько записей: блокирует, если
 *  блокирует хоть одна; укороченный — только если ничто не заблокировано. */
export function mergeDayFlags(a: DayTypeFlags, b: DayTypeFlags): DayTypeFlags {
  const blocks_secular = a.blocks_secular || b.blocks_secular
  const blocks_kodesh = a.blocks_kodesh || b.blocks_kodesh
  const is_shortened = (a.is_shortened || b.is_shortened) && !(blocks_secular || blocks_kodesh)
  return { blocks_secular, blocks_kodesh, is_shortened }
}

/**
 * Карта дата → флаги типа для подразделения в диапазоне. Deploy-safe: до
 * миграции календаря типов (нет day_type_code / calendar_day_types) откатывается
 * к прежней модели «любой особый день = full_off».
 */
export async function loadCalendarByDate(
  sb: SB,
  departmentId: string | null,
  fromDateStr: string,
  toDateStr: string,
): Promise<Map<string, DayTypeFlags>> {
  const scopes = ['all', ...(departmentId ? [departmentId] : [])]
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .from('academic_no_lesson_days')
      .select('date, scope, day_type:calendar_day_types!academic_no_lesson_days_day_type_code_fkey(blocks_secular, blocks_kodesh, is_shortened)')
      .in('scope', scopes)
      .gte('date', fromDateStr)
      .lte('date', toDateStr)
    if (error) throw error
    const map = new Map<string, DayTypeFlags>()
    for (const r of (data ?? []) as Array<{ date: string; day_type: DayTypeFlags | null }>) {
      const flags = r.day_type ?? FULL_OFF_FLAGS
      const prev = map.get(r.date)
      map.set(r.date, prev ? mergeDayFlags(prev, flags) : flags)
    }
    return map
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === '42P01' || code === '42703') {
      // Календарь типов ещё не мигрирован → прежняя модель (all = full_off).
      const set = await loadNoLessonDateSet(sb, departmentId, fromDateStr, toDateStr)
      const map = new Map<string, DayTypeFlags>()
      for (const d of set) map.set(d, FULL_OFF_FLAGS)
      return map
    }
    throw e
  }
}

/**
 * Чистая функция: разделяет кандидатов на оставленных и пропущенных по календарю
 * с учётом вида группы. Тестируется без БД.
 */
export function partitionByCalendar<T extends { scheduled_date: string }>(
  candidates: T[],
  byDate: Map<string, DayTypeFlags>,
  kind: GroupKind,
): { kept: T[]; skipped: number } {
  if (byDate.size === 0) return { kept: candidates, skipped: 0 }
  const kept: T[] = []
  let skipped = 0
  for (const c of candidates) {
    const flags = byDate.get(c.scheduled_date)
    if (flags && shouldSkipLesson(kind, flags)) skipped++
    else kept.push(c)
  }
  return { kept, skipped }
}

// ─── Legacy helpers (используются как fallback до миграции типов) ─────────────

/**
 * Множество ISO-дат (YYYY-MM-DD) особых дней для подразделения в диапазоне.
 * Deploy-safe: нет таблицы (42P01) → пустое множество.
 */
export async function loadNoLessonDateSet(
  sb: SB,
  departmentId: string | null,
  fromDateStr: string,
  toDateStr: string,
): Promise<Set<string>> {
  const scopes = ['all', ...(departmentId ? [departmentId] : [])]
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb as any)
      .from('academic_no_lesson_days')
      .select('date, scope')
      .in('scope', scopes)
      .gte('date', fromDateStr)
      .lte('date', toDateStr)
    if (error) {
      if (error.code === '42P01' || error.code === '42703') return new Set()
      throw error
    }
    return new Set((data ?? []).map((r: { date: string }) => r.date))
  } catch (e) {
    if ((e as { code?: string }).code === '42P01' || (e as { code?: string }).code === '42703') return new Set()
    throw e
  }
}

/** Чистая функция (legacy): разделяет кандидатов по множеству дат без уроков. */
export function partitionByNoLessonDays<T extends { scheduled_date: string }>(
  candidates: T[],
  noLessonDates: Set<string>,
): { kept: T[]; skipped: number } {
  if (noLessonDates.size === 0) return { kept: candidates, skipped: 0 }
  const kept: T[] = []
  let skipped = 0
  for (const c of candidates) {
    if (noLessonDates.has(c.scheduled_date)) skipped++
    else kept.push(c)
  }
  return { kept, skipped }
}
