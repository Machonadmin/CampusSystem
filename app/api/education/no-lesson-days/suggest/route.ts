import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'

/**
 * POST /api/education/no-lesson-days/suggest — материализовать шаблон в дни без
 * уроков для выбранного года (spec §3.4). НЕ мандаторно: владелец потом правит
 * список вручную. Строго добавляющее (ON CONFLICT DO NOTHING).
 *
 * Body: { template_id, year_label, gregorian_year, scope? }.
 *   scope='all' → manage_class_groups scope='all'; scope=<dept> → в подразделении.
 */

const schema = z.object({
  template_id: z.string().uuid(),
  year_label: z.string().trim().min(1).max(20),
  gregorian_year: z.number().int().min(2000).max(2100),
  scope: z.string().trim().min(1).max(64).optional(),
})

function pad(n: number): string { return String(n).padStart(2, '0') }

// Проверка реальной даты (напр. 30 февраля → невалидно) без local-TZ дрейфа.
function isRealDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, schema)
    const scope = body.scope && body.scope !== 'all' ? body.scope : 'all'
    const session = scope === 'all'
      ? await requireEducationPrivilege('manage_class_groups')
      : await requireEducationPrivilege('manage_class_groups', { department_id: scope })

    const sb = createServerClient()
    // day_type_code переносится из шаблона; до миграции колонки — грузим без него.
    const loadTplDays = (cols: string) => sb
      .from('no_lesson_day_template_days')
      .select(cols)
      .eq('template_id', body.template_id)
    let { data: days, error: dErr } = await loadTplDays('month, day, reason, day_type_code')
    if (dErr && dErr.code === '42703') {
      const fb = await loadTplDays('month, day, reason')
      days = fb.data; dErr = fb.error
    }
    if (dErr) throw dErr

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((days ?? []) as any[])
      .filter(d => isRealDate(body.gregorian_year, d.month, d.day))
      .map(d => ({
        year_label: body.year_label,
        date: `${body.gregorian_year}-${pad(d.month)}-${pad(d.day)}`,
        reason: d.reason,
        scope,
        day_type_code: d.day_type_code ?? 'full_off',
        created_by: session.person_id,
      }))
    if (rows.length === 0) return NextResponse.json({ inserted: 0 })

    const upsert = (payload: Record<string, unknown>[]) => sb
      .from('academic_no_lesson_days')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(payload as any, { onConflict: 'year_label,date,scope', ignoreDuplicates: true })
      .select('id')
    let { data: inserted, error } = await upsert(rows)
    // Колонка day_type_code ещё не мигрирована → повторяем без неё.
    if (error && error.code === '42703') {
      const legacy = rows.map(({ day_type_code: _omit, ...r }) => r)
      const retry = await upsert(legacy)
      inserted = retry.data; error = retry.error
    }
    if (error) throw error
    return NextResponse.json({ inserted: inserted?.length ?? 0 })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
