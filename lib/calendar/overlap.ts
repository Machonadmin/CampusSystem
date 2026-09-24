import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { rangesOverlap } from './calendar'

// ─── Защита от двойного бронирования (server-side, читает БД) ────────────────
//
// Встреча НЕ должна пересекаться по времени с другой ЗАПЛАНИРОВАННОЙ
// (status='scheduled') встречей того же провайдера. Отменённые / завершённые /
// no_show не блокируют слот. Решение о пересечении принимает чистая
// rangesOverlap (касание границами — НЕ пересечение), см. calendar.ts.
//
// Кандидатов выбираем узким SQL-фильтром (starts_at < ends_at И ends_at >
// starts_at), затем ПОДТВЕРЖДАЕМ каждого через rangesOverlap. Читаем
// постранично — на случай, если у провайдера накопилось >1000 встреч в окне.

const PAGE = 1000

/**
 * Есть ли у провайдера запланированная встреча, пересекающаяся с интервалом
 * [startsAt, endsAt). excludeId — id редактируемой встречи (исключить саму себя).
 */
export async function hasOverlappingAppointment(
  sb: SupabaseClient<Database>,
  providerId: string,
  startsAt: string,
  endsAt: string,
  excludeId?: string,
): Promise<boolean> {
  let from = 0
  for (;;) {
    let q = sb
      .from('appointments')
      .select('id, starts_at, ends_at')
      .eq('provider_id', providerId)
      .eq('status', 'scheduled')
      .lt('starts_at', endsAt)      // кандидат начинается раньше конца нового
      .gt('ends_at', startsAt)      // и заканчивается позже начала нового
      .order('starts_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (excludeId) q = q.neq('id', excludeId)

    const { data, error } = await q
    if (error) throw error
    const rows = data ?? []

    for (const r of rows) {
      if (rangesOverlap(startsAt, endsAt, r.starts_at as string, r.ends_at as string)) {
        return true
      }
    }
    if (rows.length < PAGE) break
    from += PAGE
  }
  return false
}

// ─── Пересечение встречи с УРОКОМ преподавателя (тот же личный календарь) ──────
//
// «Твой календарь занят в это время»: нельзя ставить встречу поверх собственного
// урока. Проверяем уроки групп, где person — преподаватель (class_teachers), на
// дату встречи. Отменённые уроки не блокируют. Урок без времени окончания
// считаем длиной 60 мин (типовая пара). Сравнение — по минутам суток в пределах
// одного дня (без TZ-скоса): встреча и урок на одной дате.

const DEFAULT_LESSON_MIN = 60

function hhmmssToMin(t: string | null): number | null {
  if (!t) return null
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** 'YYYY-MM-DDTHH:mm[:ss]' → минуты суток (по локальной части строки, без TZ). */
function isoTimeToMin(iso: string): number | null {
  const m = iso.match(/T(\d{1,2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Есть ли у преподавателя урок, пересекающийся с интервалом встречи
 * [startsAt, endsAt) в тот же день. Возвращает описание первого пересечения
 * ({ time }) или null. Deploy-safe: нет class_teachers/lessons → null.
 */
export async function overlappingLesson(
  sb: SupabaseClient<Database>,
  personId: string,
  startsAt: string,
  endsAt: string,
): Promise<{ time: string } | null> {
  const date = startsAt.slice(0, 10)
  const aStart = isoTimeToMin(startsAt)
  const aEnd = isoTimeToMin(endsAt)
  if (aStart === null || aEnd === null) return null

  const { data: ct } = await sb.from('class_teachers').select('class_group_id').eq('teacher_id', personId)
  const groupIds = [...new Set((ct ?? []).map(r => (r as { class_group_id: string }).class_group_id))]
  if (groupIds.length === 0) return null

  // scheduled_end_time добавлена миграцией; читаем через '*' (deploy-safe).
  const { data: lessons } = await sb
    .from('lessons')
    .select('*')
    .in('class_group_id', groupIds)
    .eq('scheduled_date', date)
  for (const l of (lessons ?? []) as Array<{ scheduled_time: string | null; scheduled_end_time?: string | null; is_cancelled?: boolean }>) {
    if (l.is_cancelled) continue
    const ls = hhmmssToMin(l.scheduled_time)
    if (ls === null) continue
    const le = hhmmssToMin(l.scheduled_end_time ?? null) ?? ls + DEFAULT_LESSON_MIN
    if (aStart < le && ls < aEnd) {
      const hh = String(Math.floor(ls / 60)).padStart(2, '0')
      const mm = String(ls % 60).padStart(2, '0')
      return { time: `${hh}:${mm}` }
    }
  }
  return null
}
