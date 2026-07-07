import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getClassGroupTarget } from '@/lib/education/lesson-access'
import type { LessonInsert } from '@/types/database'
import { MS_PER_DAY, parseDateUTC, fmtDateUTC, isoWeekday } from '@/lib/education/schedule-dates'

const MAX_RANGE_DAYS = 366

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: 'Неверный идентификатор' }
  if (error.code === '23503') return { status: 400, message: 'Ссылка на несуществующую запись' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
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
    if (!target) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 })

    const session = await requireEducationPrivilege('set_lesson_topics', target)

    // Период группы — источник дефолтных границ.
    const { data: group, error: gErr } = await sb
      .from('class_groups')
      .select('period_start, period_end')
      .eq('id', params.id)
      .maybeSingle()
    if (gErr) throw gErr
    if (!group) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 })

    const fromStr = body.from?.trim() || group.period_start
    const toStr = body.to?.trim() || group.period_end
    if (!fromStr || !toStr) {
      return NextResponse.json(
        { error: 'Укажите период (from/to): у группы не задан period_start/period_end' },
        { status: 400 }
      )
    }

    const fromMs = parseDateUTC(fromStr)
    const toMs = parseDateUTC(toStr)
    if (fromMs === null || toMs === null) {
      return NextResponse.json({ error: 'Неверный формат даты (ожидается YYYY-MM-DD)' }, { status: 400 })
    }
    if (toMs < fromMs) {
      return NextResponse.json({ error: 'Конец периода раньше начала' }, { status: 400 })
    }
    const days = Math.round((toMs - fromMs) / MS_PER_DAY) + 1
    if (days > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Слишком большой период: ${days} дн. (максимум ${MAX_RANGE_DAYS})` }, { status: 400 })
    }

    // Слоты группы, сгруппированные по дню недели.
    const { data: slots, error: sErr } = await sb
      .from('class_schedule_slots')
      .select('day_of_week, start_time, room')
      .eq('class_group_id', params.id)
    if (sErr) throw sErr

    const byDay = new Map<number, { start_time: string; room: string | null }[]>()
    for (const s of slots ?? []) {
      const arr = byDay.get(s.day_of_week) ?? []
      arr.push({ start_time: s.start_time, room: s.room })
      byDay.set(s.day_of_week, arr)
    }

    // Кандидаты-уроки: для каждой даты периода — слоты её дня недели.
    const candidates: LessonInsert[] = []
    for (let ms = fromMs; ms <= toMs; ms += MS_PER_DAY) {
      const daySlots = byDay.get(isoWeekday(ms))
      if (!daySlots) continue
      const dateStr = fmtDateUTC(ms)
      for (const s of daySlots) {
        candidates.push({
          class_group_id: params.id,
          scheduled_date: dateStr,
          scheduled_time: s.start_time,
          location: s.room,
          created_by: session.person_id,
        })
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({ created: 0, skipped: 0 })
    }

    // Строго INSERT: ON CONFLICT DO NOTHING по UNIQUE(class_group_id, date, time).
    // .select() при ignoreDuplicates возвращает ТОЛЬКО реально вставленные строки.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: insErr } = await sb
      .from('lessons')
      .upsert(candidates as any, {
        onConflict: 'class_group_id,scheduled_date,scheduled_time',
        ignoreDuplicates: true,
      })
      .select('id')
    if (insErr) {
      const m = mapDbError(insErr)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    const created = inserted?.length ?? 0
    const skipped = candidates.length - created
    return NextResponse.json({ created, skipped })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
