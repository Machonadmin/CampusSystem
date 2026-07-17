import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Кодеш (לימודי קודש) обязателен для КАЖДОЙ студентки — «всегда кодеш, ЕСЛИ
 * нет особого одобрения менеджера». Одобренное исключение (חריגת קודש) хранится
 * в таблице kodesh_exceptions и на период своего действия ОСВОБОЖДАЕТ студентку
 * от уроков кодеша: её не ждут в журнале, урок исчезает из её календаря и не
 * портит её статистику посещаемости.
 *
 * Этот модуль — единый источник правды для «активно ли исключение на дату D» и
 * «какие группы относятся к кафедре кодеша». Все read/report-роуты фильтруют
 * уроки кодеша через него.
 *
 * Активно на дату D:  effective_from <= D AND (effective_to IS NULL OR effective_to >= D).
 * Даты — строки 'YYYY-MM-DD'; лексикографическое сравнение = хронологическое.
 *
 * Деплой-безопасно: если миграция ещё не применена (42P01) — исключений нет.
 */
export const KODESH_DEPT_ID = '9a3d7b3f-3f65-4653-a111-4d5296404a27'

type SB = ReturnType<typeof createServerClient>

function untyped(sb: SB) {
  return sb as unknown as SupabaseClient
}

/** Нормализует дату/таймстамп к 'YYYY-MM-DD' для сравнения диапазонов. */
function dayOf(dateISO: string): string {
  return dateISO.slice(0, 10)
}

/**
 * Множество id учебных групп кафедры кодеша. Урок относится к кодешу, если его
 * class_group_id входит в это множество. Деплой-безопасно (42P01 → пусто).
 */
export async function loadKodeshGroupIds(sb: SB): Promise<Set<string>> {
  try {
    const { data, error } = await sb
      .from('class_groups')
      .select('id')
      .eq('department_id', KODESH_DEPT_ID)
    if (error) throw error
    return new Set((data ?? []).map(g => g.id))
  } catch (e) {
    if ((e as { code?: string }).code === '42P01') return new Set()
    throw e
  }
}

export type ExemptionRange = { from: string; to: string | null }

/**
 * Активен ли хоть один диапазон освобождения на дату dateISO.
 * Границы включительны; to = null означает бессрочно. Даты — 'YYYY-MM-DD'
 * (или таймстампы — берётся дневная часть); лексикографика = хронология.
 * Чистая функция — вынесена для юнит-тестов краевых условий.
 */
export function dateInAnyRange(ranges: ExemptionRange[], dateISO: string): boolean {
  if (!ranges || ranges.length === 0) return false
  const d = dayOf(dateISO)
  return ranges.some(r => dayOf(r.from) <= d && (r.to === null || dayOf(r.to) >= d))
}

export interface KodeshExemptions {
  /** Есть ли вообще хоть одно исключение среди запрошенных journey. */
  hasAny: boolean
  /** Освобождена ли данная студентка от кодеша на данную дату. */
  isExempt: (journeyId: string, dateISO: string) => boolean
}

/**
 * Загружает активные периоды освобождения для набора journey_id и возвращает
 * предикат isExempt(journeyId, dateISO). Одна запись = один диапазон дат.
 * Деплой-безопасно (42P01 → никто не освобождён).
 */
export async function loadKodeshExemptions(
  sb: SB,
  journeyIds: string[],
): Promise<KodeshExemptions> {
  const map = new Map<string, ExemptionRange[]>()
  const ids = [...new Set(journeyIds)].filter(Boolean)
  if (ids.length === 0) {
    return { hasAny: false, isExempt: () => false }
  }
  try {
    const { data, error } = await untyped(sb)
      .from('kodesh_exceptions')
      .select('journey_id, effective_from, effective_to')
      .in('journey_id', ids)
    if (error) throw error
    for (const r of (data ?? []) as Array<{
      journey_id: string; effective_from: string; effective_to: string | null
    }>) {
      const arr = map.get(r.journey_id) ?? []
      arr.push({ from: dayOf(r.effective_from), to: r.effective_to ? dayOf(r.effective_to) : null })
      map.set(r.journey_id, arr)
    }
  } catch (e) {
    if ((e as { code?: string }).code !== '42P01') throw e
    // Таблицы ещё нет — исключений нет.
  }
  return {
    hasAny: map.size > 0,
    isExempt: (journeyId: string, dateISO: string) => {
      const ranges = map.get(journeyId)
      if (!ranges) return false
      return dateInAnyRange(ranges, dateISO)
    },
  }
}
