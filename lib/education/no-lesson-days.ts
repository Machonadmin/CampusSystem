import { createServerClient } from '@/lib/supabase/server'

type SB = ReturnType<typeof createServerClient>

/**
 * Дни без уроков (ימים ללא לימודים, spec §3.4 / §4.5). Порождение уроков
 * ПРОПУСКАЕТ даты, которые попадают в academic_no_lesson_days со scope='all'
 * ИЛИ scope=подразделение группы. Дата — точка во времени, поэтому фильтруем по
 * диапазону дат (year_label — лишь метка для управления/группировки, не участвует
 * в пропуске).
 */

/**
 * Множество ISO-дат (YYYY-MM-DD) без уроков для подразделения в диапазоне.
 * Deploy-safe: нет таблицы (42P01) → пустое множество (ничего не пропускаем).
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

/**
 * Чистая функция: разделяет кандидатов на оставленных и пропущенных по датам без
 * уроков. Тестируется без БД.
 */
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
