import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isMissingRelation } from '@/lib/supabase/errors'
import { generateLessonsForGroup, clampHorizonToPeriod } from '@/lib/education/lesson-generation'

/**
 * GET /api/cron/generate-lessons — ежедневная материализация уроков (Vercel Cron).
 *
 * Закрывает главный разрыв цепочки «расписание → журнал»: раньше уроки
 * появлялись только после ручной кнопки «порождение» на каждой группе — если
 * менеджер забыл, у преподавателя не было что отмечать. Теперь каждый день
 * прокатываем rolling-горизонт: для каждой активной группы со слотами
 * порождаем уроки на ближайшие HORIZON_DAYS, подрезая периодом группы.
 *
 * Идемпотентно (ON CONFLICT DO NOTHING) — повторные запуски ничего не дублируют,
 * отменённые/ручные уроки не трогаются, pending-слоты (кодеш) пропускаются.
 *
 * Защита: как /api/cron/reminders — если задан CRON_SECRET, требуем
 * Authorization: Bearer <CRON_SECRET>. Маршрут под PUBLIC_API_PREFIXES.
 */
export const dynamic = 'force-dynamic'

const HORIZON_DAYS = 14
const PAGE = 1000

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const sb = createServerClient()
  const todayStr = new Date().toISOString().slice(0, 10)

  try {
    // Группы, у которых вообще есть слоты (постранично — без тихого среза на 1000).
    const groupIds = new Set<string>()
    for (let fromRow = 0; ; fromRow += PAGE) {
      const { data, error } = await sb
        .from('class_schedule_slots')
        .select('class_group_id')
        .range(fromRow, fromRow + PAGE - 1)
      if (error) {
        if (isMissingRelation(error)) return NextResponse.json({ ok: true, groups: 0, created: 0 })
        throw error
      }
      for (const r of data ?? []) groupIds.add(r.class_group_id)
      if (!data || data.length < PAGE) break
    }
    if (groupIds.size === 0) return NextResponse.json({ ok: true, groups: 0, created: 0 })

    // Данные групп: активность, статус семестра, период. select('*') —
    // деплой-безопасно к отсутствию новых колонок (sem_status и т.п.).
    const ids = [...groupIds]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groups: any[] = []
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await sb.from('class_groups').select('*').in('id', ids.slice(i, i + 200))
      if (error) throw error
      groups.push(...(data ?? []))
    }

    let created = 0
    let processed = 0
    const errors: string[] = []
    for (const g of groups) {
      if (g.is_active === false) continue
      if ((g.sem_status ?? 'open') === 'closed') continue
      const horizon = clampHorizonToPeriod(todayStr, HORIZON_DAYS, g.period_start ?? null, g.period_end ?? null)
      if (!horizon) continue
      try {
        const res = await generateLessonsForGroup(sb, g.id, horizon.fromMs, horizon.toMs, null)
        created += res.created
        processed++
      } catch (e) {
        // Одна сломанная группа не должна останавливать остальные.
        errors.push(`${g.id}: ${(e as { message?: string }).message ?? 'error'}`)
      }
    }

    return NextResponse.json({ ok: true, groups: processed, created, ...(errors.length ? { errors } : {}) })
  } catch (err: unknown) {
    const e = err as { message?: string }
    return NextResponse.json({ ok: false, error: e.message ?? 'error' }, { status: 500 })
  }
}
