import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getClassGroupTarget } from '@/lib/education/lesson-access'
import { generateLessonsForGroup } from '@/lib/education/lesson-generation'
import { MS_PER_DAY, parseDateUTC } from '@/lib/education/schedule-dates'

const MAX_RANGE_DAYS = 366

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: serverT('invalid_id') }
  if (error.code === '23503') return { status: 400, message: serverT('invalid_reference') }
  return { status: 500, message: error.message ?? serverT('db_error') }
}

/**
 * POST /api/education/class-groups/[id]/schedule/generate
 * Порождает уроки (lessons) из слотов расписания за период [from, to].
 * Право: set_lesson_topics в контексте группы.
 *
 * Body: { from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' } — по умолчанию берётся
 * period_start/period_end группы; если период не задан и не передан — 400.
 *
 * СТРОГО ДОБАВЛЯЮЩЕЕ: только INSERT (upsert с ignoreDuplicates → ON CONFLICT
 * DO NOTHING по существующему UNIQUE(class_group_id, scheduled_date,
 * scheduled_time)). Никогда не UPDATE/DELETE; не трогает вручную созданные
 * и отменённые уроки. Возвращает { created, skipped }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Тело необязательно (период может браться из группы) — пустой body допустим.
    let body: { from?: string; to?: string } = {}
    try { body = await request.json() } catch { body = {} }

    const sb = createServerClient()

    const target = await getClassGroupTarget(sb, params.id)
    if (!target) return apiError('group_not_found', 404)

    const session = await requireEducationPrivilege('set_lesson_topics', target)

    // Период группы — источник дефолтных границ.
    const { data: group, error: gErr } = await sb
      .from('class_groups')
      .select('period_start, period_end')
      .eq('id', params.id)
      .maybeSingle()
    if (gErr) throw gErr
    if (!group) return apiError('group_not_found', 404)

    const fromStr = body.from?.trim() || group.period_start
    const toStr = body.to?.trim() || group.period_end
    if (!fromStr || !toStr) {
      return apiError('period_required_group_no_dates', 400)
    }

    const fromMs = parseDateUTC(fromStr)
    const toMs = parseDateUTC(toStr)
    if (fromMs === null || toMs === null) {
      return apiError('invalid_date_format_ymd', 400)
    }
    if (toMs < fromMs) {
      return apiError('period_end_before_start', 400)
    }
    const days = Math.round((toMs - fromMs) / MS_PER_DAY) + 1
    if (days > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Слишком большой период: ${days} дн. (максимум ${MAX_RANGE_DAYS})` }, { status: 400 })
    }

    // Делегируем общей логике порождения (единый источник: активные слоты +
    // ПРОПУСК дней без уроков, spec §4.5). Строго добавляющее (ON CONFLICT DO
    // NOTHING). Возвращает created / skipped(=уже существовали) / skippedNoLessonDays.
    const { created, skipped, skippedNoLessonDays } = await generateLessonsForGroup(
      sb, params.id, fromMs, toMs, session.person_id,
    )
    return NextResponse.json({ created, skipped, skippedNoLessonDays })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
