import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'
import { apiError } from '@/lib/i18n/api-errors'
import { jsonError } from '@/lib/api/handler'
import { todayISO } from '@/lib/dates'
import { currentPeriodKey, isPeriodPast, periodContainsToday, type DatedPeriod } from '@/lib/education/period-lock'

/**
 * GET /api/education/periods — учебные периоды (year_label [+ term]) с диапазоном
 * дат (spec §4.11, решение архитектора). Текущий период = семестр, чей диапазон
 * СОДЕРЖИТ сегодня (иначе — самый поздний по дате окончания). Любой период, чья
 * дата окончания прошла, помечается is_past=true → только чтение.
 *
 * Даты периода агрегируются по семестровым группам (min(period_start) /
 * max(period_end)). Deploy-safe: нет таблицы/колонок → пусто.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const allowed = (await canDoEducationInAny(session, 'view_students'))
      || (await canDoEducationInAny(session, 'manage_class_groups'))
    if (!allowed) return apiError('forbidden', 403)

    const sb = createServerClient()
    let rows: Array<{ year_label: string | null; term_number: number | null; period_start: string | null; period_end: string | null }> = []
    try {
      const { data, error } = await sb
        .from('class_groups')
        .select('year_label, term_number, period_start, period_end')
        .eq('is_semester', true)
      if (error) throw error
      rows = (data ?? []) as typeof rows
    } catch (e) {
      if ((e as { code?: string }).code !== '42P01' && (e as { code?: string }).code !== '42703') throw e
    }

    // Агрегируем по (year_label, term): min(start) / max(end).
    const agg = new Map<string, { yearLabel: string; term: number | null; start: string | null; end: string | null }>()
    for (const r of rows) {
      if (!r.year_label) continue
      const term = r.term_number ?? null
      const key = `${r.year_label}#${term ?? ''}`
      const cur = agg.get(key) ?? { yearLabel: r.year_label, term, start: null, end: null }
      if (r.period_start && (cur.start === null || r.period_start < cur.start)) cur.start = r.period_start
      if (r.period_end && (cur.end === null || r.period_end > cur.end)) cur.end = r.period_end
      agg.set(key, cur)
    }

    const today = todayISO()
    const items = [...agg.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => (a.yearLabel === b.yearLabel ? (a.term ?? 0) - (b.term ?? 0) : a.yearLabel.localeCompare(b.yearLabel, 'he')))

    const dated: DatedPeriod[] = items.map(p => ({ key: p.key, start: p.start, end: p.end }))
    const currentKey = currentPeriodKey(dated, today)
    // Активен ли текущий период (есть семестр, чей диапазон содержит сегодня) —
    // для авто-переключения домашних экранов (§4.2/§4.11).
    const currentActive = dated.some(p => periodContainsToday(p, today))

    return NextResponse.json({
      periods: items.map(p => ({
        yearLabel: p.yearLabel, term: p.term, key: p.key,
        start: p.start, end: p.end,
        is_past: isPeriodPast(p.end, today),
      })),
      currentKey,
      current_active: currentActive,
    })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
