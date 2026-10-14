import { createServerClient } from '@/lib/supabase/server'
import { APP_TIME_ZONE } from '@/lib/dates'
import { isMissingRelation } from '@/lib/supabase/errors'
import { pushNotificationRows } from '@/lib/notifications/create'

type SB = ReturnType<typeof createServerClient>

/**
 * «חברותא קבועה»: напоминание утром в день встречи и вопрос «была ли встреча»
 * после неё (решение владельца 2026-10-13: «בכל רביעי תזכורת בבוקר שיש לה
 * חברותא, ואחרי הזמן שאלה האם היית או לא»).
 *
 * Постоянная пара = chavruta_pairs с weekday (0 = вс … 6 = сб) и start_time
 * (время по Израилю). Без дня/времени пара в напоминаниях не участвует.
 *
 *   • Утро (с 06:00 по Израилю и до начала встречи): одно уведомление море со
 *     всеми встречами дня. Дедуп: type='chavruta_today', metadata.date.
 *   • Вопрос: через QUESTION_DELAY_MIN после начала, если встреча не записана и
 *     мора не ответила «не состоялась» (chavruta_skips). Вчерашние неотвеченные
 *     тоже спрашиваются (утренний cron ловит позднюю встречу). Пара, заведённая
 *     уже после встречи, о ней не спрашивает. Дедуп: type='chavruta_check',
 *     metadata.pair_id + date.
 *
 * Вызывается из cron (все моры: утром и вечером) и при опросе колокольчика
 * (только своя мора — вопрос приходит вовремя, пока сайт открыт). Best-effort,
 * деплой-безопасно: до миграции 20261013140000 молча ничего не делает.
 */

export const QUESTION_DELAY_MIN = 60
const MORNING_FROM_MIN = 6 * 60

export const WEEKDAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

/** Дата, день недели и минуты от полуночи момента `at` по времени учреждения. */
export function localParts(at: Date, tz: string = APP_TIME_ZONE): { date: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  }
}

/** Предыдущий календарный день для ISO 'YYYY-MM-DD'. */
export function previousDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** День недели (0 = вс) календарной даты ISO 'YYYY-MM-DD'. */
export function weekdayOfDate(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay()
}

/** 'HH:MM' или 'HH:MM:SS' → минуты от полуночи; null, если не время. */
export function timeToMinutes(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec((t ?? '').trim())
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** 'HH:MM:SS' → 'HH:MM' для показа. */
export function shortTime(t: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec((t ?? '').trim())
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''
}

/**
 * Разбор дня/времени из тела запроса. Поле, которого нет в теле, не трогается;
 * null или '' — очистить. Возвращает null, если значение неверное.
 */
export function parseSchedule(body: { weekday?: unknown; start_time?: unknown }): { weekday?: number | null; start_time?: string | null } | null {
  const out: { weekday?: number | null; start_time?: string | null } = {}
  if (body.weekday !== undefined) {
    if (body.weekday === null || body.weekday === '') out.weekday = null
    else {
      const w = Number(body.weekday)
      if (!Number.isInteger(w) || w < 0 || w > 6) return null
      out.weekday = w
    }
  }
  if (body.start_time !== undefined) {
    if (body.start_time === null || body.start_time === '') out.start_time = null
    else {
      if (typeof body.start_time !== 'string' || timeToMinutes(body.start_time) == null) return null
      out.start_time = shortTime(body.start_time)
    }
  }
  return out
}

export interface ScheduledPair {
  id: string
  teacher_person_id: string
  student_journey_id: string
  weekday: number
  start_time: string
  created_at: string
}

export interface ScheduleNow { date: string; weekday: number; minutes: number }

/** Встречи, о которых пора напомнить утром: день совпал, время ещё не наступило. */
export function pairsForMorning(pairs: ScheduledPair[], now: ScheduleNow): ScheduledPair[] {
  if (now.minutes < MORNING_FROM_MIN) return []
  return pairs.filter(p => {
    const start = timeToMinutes(p.start_time)
    return p.weekday === now.weekday && start != null && now.minutes < start
  })
}

/**
 * Встречи, о которых пора спросить «была ли»: сегодняшние через
 * QUESTION_DELAY_MIN после начала и все вчерашние. Только если пара заведена
 * до начала встречи. Записанные/отвеченные отсеивает вызывающий.
 */
export function pairsToAsk(pairs: ScheduledPair[], now: ScheduleNow): Array<{ pair: ScheduledPair; date: string }> {
  const yesterday = previousDate(now.date)
  const yesterdayWeekday = (now.weekday + 6) % 7
  const out: Array<{ pair: ScheduledPair; date: string }> = []
  for (const p of pairs) {
    const start = timeToMinutes(p.start_time)
    if (start == null) continue
    let date: string | null = null
    if (p.weekday === now.weekday && now.minutes >= start + QUESTION_DELAY_MIN) date = now.date
    else if (p.weekday === yesterdayWeekday) date = yesterday
    if (!date) continue
    const created = localParts(new Date(p.created_at))
    if (created.date > date || (created.date === date && created.minutes >= start)) continue
    out.push({ pair: p, date })
  }
  return out
}

/** Активные пары с днём и временем (вся школа или одна мора). [] до миграции. */
export async function loadScheduledPairs(sb: SB, teacherId?: string): Promise<ScheduledPair[]> {
  try {
    let q = sb.from('chavruta_pairs')
      .select('id, teacher_person_id, student_journey_id, weekday, start_time, created_at')
      .eq('is_active', true)
      .not('weekday', 'is', null)
      .not('start_time', 'is', null)
    if (teacherId) q = q.eq('teacher_person_id', teacherId)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as ScheduledPair[]
  } catch (e) {
    if (isMissingRelation(e)) return []
    throw e
  }
}

/** Мора, у которой сегодня есть постоянная встреча (вместо общего вопроса по средам). */
export async function teachersWithChavrutaToday(sb: SB, at: Date = new Date()): Promise<Set<string>> {
  const now = localParts(at)
  const pairs = await loadScheduledPairs(sb)
  return new Set(pairs.filter(p => p.weekday === now.weekday).map(p => p.teacher_person_id))
}

async function studentNames(sb: SB, journeyIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const ids = [...new Set(journeyIds)]
  if (ids.length === 0) return out
  const { data } = await sb.from('education_journeys')
    .select('id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
    .in('id', ids)
  for (const j of (data ?? []) as Array<{ id: string; person: { full_name?: string | null; hebrew_name?: string | null } | null }>) {
    out.set(j.id, (j.person?.hebrew_name || j.person?.full_name || '').trim())
  }
  return out
}

/** Существующие уведомления данного типа за последние дни: множество ключей metadata. */
async function notifiedKeys(sb: SB, type: string, teacherIds: string[], key: (m: Record<string, unknown>) => string): Promise<Set<string>> {
  const out = new Set<string>()
  if (teacherIds.length === 0) return out
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString()
  const { data, error } = await sb.from('notifications')
    .select('person_id, metadata')
    .eq('type', type).in('person_id', teacherIds).gte('created_at', since)
  if (error) throw error
  for (const n of (data ?? []) as Array<{ person_id: string; metadata: Record<string, unknown> | null }>) {
    out.add(`${n.person_id}|${key(n.metadata ?? {})}`)
  }
  return out
}

/** Утренние напоминания и вопросы «была ли встреча». Возвращает число созданных уведомлений. */
export async function materializeChavrutaSchedule(sb: SB, opts: { teacherId?: string; at?: Date } = {}): Promise<number> {
  try {
    const now = localParts(opts.at ?? new Date())
    const pairs = await loadScheduledPairs(sb, opts.teacherId)
    if (pairs.length === 0) return 0

    const morning = pairsForMorning(pairs, now)
    let ask = pairsToAsk(pairs, now)
    if (morning.length === 0 && ask.length === 0) return 0

    // Отсеиваем записанные встречи и ответы «не состоялась».
    if (ask.length) {
      const teacherIds = [...new Set(ask.map(a => a.pair.teacher_person_id))]
      const dates = [...new Set(ask.map(a => a.date))]
      const { data: logged, error: lErr } = await sb.from('staff_work_entries')
        .select('person_id, student_journey_id, entry_date')
        .eq('entry_type', 'chavruta').in('person_id', teacherIds).in('entry_date', dates)
      if (lErr) throw lErr
      const loggedKeys = new Set((logged ?? []).map(r => `${r.person_id}|${r.student_journey_id}|${r.entry_date}`))
      const { data: skips, error: sErr } = await sb.from('chavruta_skips')
        .select('pair_id, skip_date').in('pair_id', ask.map(a => a.pair.id)).in('skip_date', dates)
      if (sErr) throw sErr
      const skipKeys = new Set((skips ?? []).map(r => `${r.pair_id}|${r.skip_date}`))
      const asked = await notifiedKeys(sb, 'chavruta_check', teacherIds, m => `${m.pair_id}|${m.date}`)
      ask = ask.filter(a =>
        !loggedKeys.has(`${a.pair.teacher_person_id}|${a.pair.student_journey_id}|${a.date}`) &&
        !skipKeys.has(`${a.pair.id}|${a.date}`) &&
        !asked.has(`${a.pair.teacher_person_id}|${a.pair.id}|${a.date}`))
    }

    const morningTeachers = [...new Set(morning.map(p => p.teacher_person_id))]
    const reminded = await notifiedKeys(sb, 'chavruta_today', morningTeachers, m => String(m.date))
    const morningByTeacher = new Map<string, ScheduledPair[]>()
    for (const p of morning) {
      if (reminded.has(`${p.teacher_person_id}|${now.date}`)) continue
      morningByTeacher.set(p.teacher_person_id, [...(morningByTeacher.get(p.teacher_person_id) ?? []), p])
    }
    if (morningByTeacher.size === 0 && ask.length === 0) return 0

    const names = await studentNames(sb, [...morning, ...ask.map(a => a.pair)].map(p => p.student_journey_id))
    const label = (p: ScheduledPair) => `${names.get(p.student_journey_id) || '—'} ב-${shortTime(p.start_time)}`

    const rows: Array<{ person_id: string; type: string; title: string; link: string; metadata: Record<string, unknown> }> = []
    for (const [teacherId, list] of morningByTeacher) {
      const sorted = list.slice().sort((a, b) => (timeToMinutes(a.start_time) ?? 0) - (timeToMinutes(b.start_time) ?? 0))
      rows.push({
        person_id: teacherId,
        type: 'chavruta_today',
        title: `היום יש לך חברותא: ${sorted.map(label).join(', ')}`,
        link: `/dashboard/chavruta?date=${now.date}`,
        metadata: { date: now.date },
      })
    }
    for (const a of ask) {
      const when = a.date === now.date ? 'היום' : 'אתמול'
      rows.push({
        person_id: a.pair.teacher_person_id,
        type: 'chavruta_check',
        title: `החברותא ${when} עם ${label(a.pair)} התקיימה?`,
        link: `/dashboard/chavruta?date=${a.date}`,
        metadata: { pair_id: a.pair.id, date: a.date },
      })
    }

    const { error } = await sb.from('notifications')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(rows as any)
    if (error) return 0
    await pushNotificationRows(sb, rows)
    return rows.length
  } catch {
    return 0
  }
}
