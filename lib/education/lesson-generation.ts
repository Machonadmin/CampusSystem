import { createServerClient } from '@/lib/supabase/server'
import type { LessonInsert } from '@/types/database'
import { MS_PER_DAY, parseDateUTC, fmtDateUTC, isoWeekday } from '@/lib/education/schedule-dates'

type SB = ReturnType<typeof createServerClient>

/**
 * Материализация уроков (lessons) из слотов расписания (class_schedule_slots).
 * Общая логика для трёх вызовов: ручная кнопка «порождение» на вкладке
 * расписания, ежедневный cron (rolling-горизонт) и авто-порождение при
 * утверждении кодеш-слота.
 *
 * СТРОГО ДОБАВЛЯЮЩЕЕ: только INSERT c ON CONFLICT DO NOTHING по
 * UNIQUE(class_group_id, scheduled_date, scheduled_time). Никогда не трогает
 * существующие/отменённые/ручные уроки. Слоты в 'pending'/'rejected'
 * (ожидают אישור מנהל) пропускаются.
 */
export async function generateLessonsForGroup(
  sb: SB,
  groupId: string,
  fromMs: number,
  toMs: number,
  createdBy: string | null,
  opts?: { onlySlotIds?: string[] },
): Promise<{ created: number; skipped: number }> {
  // select('*') — деплой-безопасно: approval_status может отсутствовать до
  // применения миграции (undefined → считаем 'active').
  let q = sb.from('class_schedule_slots').select('*').eq('class_group_id', groupId)
  if (opts?.onlySlotIds && opts.onlySlotIds.length > 0) q = q.in('id', opts.onlySlotIds)
  const { data: slots, error: sErr } = await q
  if (sErr) throw sErr

  const activeSlots = (slots ?? []).filter(
    (s: { approval_status?: string }) => (s.approval_status ?? 'active') === 'active',
  )
  if (activeSlots.length === 0) return { created: 0, skipped: 0 }

  const byDay = new Map<number, { start_time: string; room: string | null }[]>()
  for (const s of activeSlots) {
    const arr = byDay.get(s.day_of_week) ?? []
    arr.push({ start_time: s.start_time, room: s.room })
    byDay.set(s.day_of_week, arr)
  }

  const candidates: LessonInsert[] = []
  for (let ms = fromMs; ms <= toMs; ms += MS_PER_DAY) {
    const daySlots = byDay.get(isoWeekday(ms))
    if (!daySlots) continue
    const dateStr = fmtDateUTC(ms)
    for (const s of daySlots) {
      candidates.push({
        class_group_id: groupId,
        scheduled_date: dateStr,
        scheduled_time: s.start_time,
        location: s.room,
        created_by: createdBy,
      })
    }
  }
  if (candidates.length === 0) return { created: 0, skipped: 0 }

  // .select() при ignoreDuplicates возвращает ТОЛЬКО реально вставленные строки.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insErr } = await sb
    .from('lessons')
    .upsert(candidates as any, {
      onConflict: 'class_group_id,scheduled_date,scheduled_time',
      ignoreDuplicates: true,
    })
    .select('id')
  if (insErr) throw insErr

  const created = inserted?.length ?? 0
  return { created, skipped: candidates.length - created }
}

/**
 * Горизонт генерации [сегодня; сегодня+days-1] в UTC-миллисекундах,
 * ПОДРЕЗАННЫЙ периодом группы (period_start/period_end), если он задан.
 * null — генерировать нечего (горизонт не пересекается с периодом).
 */
export function clampHorizonToPeriod(
  todayStr: string,
  days: number,
  periodStart: string | null,
  periodEnd: string | null,
): { fromMs: number; toMs: number } | null {
  const todayMs = parseDateUTC(todayStr)
  if (todayMs === null) return null
  let fromMs = todayMs
  let toMs = todayMs + (days - 1) * MS_PER_DAY
  const ps = periodStart ? parseDateUTC(periodStart) : null
  const pe = periodEnd ? parseDateUTC(periodEnd) : null
  if (ps !== null && ps > fromMs) fromMs = ps
  if (pe !== null && pe < toMs) toMs = pe
  return toMs < fromMs ? null : { fromMs, toMs }
}
