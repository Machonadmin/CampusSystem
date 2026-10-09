import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/supabase/errors'
import { verifyFeedToken } from '@/lib/calendar/feed-token'
import { buildICS, type IcsEvent } from '@/lib/calendar/ics'
import {
  personalEventsToIcs, appointmentsToIcs, tasksToIcs, lessonsToIcs,
  type FeedEventRow, type FeedApptRow, type FeedTaskRow,
} from '@/lib/calendar/feed-items'
import { resolveMyClassGroupIds } from '@/lib/calendar/my-classes'
import { todayISO } from '@/lib/dates'
import { OPEN_TASK_STATUSES } from '@/lib/tasks/status'

/**
 * GET /api/public/calendar-feed?token=... — iCal (.ics) подписка на календарь
 * пользователя. Публичный (под PUBLIC_API_PREFIXES): Google Calendar тянет URL
 * без cookie. Авторизация — подписанным фид-токеном (capability): person_id
 * берётся из него, невалидный/просроченный → 404.
 *
 * Область фида (решение владельца 2026-10-08, M2: «всё, что есть у пользователя»),
 * окно [сегодня-30д … сегодня+180д]:
 *   • личные события календаря;
 *   • встречи: созданные им, назначенные ему как студентке, и куда его
 *     пригласили (кроме отклонённых приглашений);
 *   • открытые задачи со сроком;
 *   • уроки его учебных групп (как преподавателя и как студентки).
 * Всё self-scoped — ровно то, что пользователь видит в своём календаре в
 * приложении. Каждый слой независим: сбой одного не ломает фид.
 */

export const dynamic = 'force-dynamic'

function addDaysUTC(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const PAGE = 1000
const IN_CHUNK = 200

/** Разбить список id на куски для .in() (пустой список → ни одного куска). */
function chunk<T>(arr: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Есть ли у человека активный вход. null — база не ответила. */
async function hasActiveLogin(sb: ReturnType<typeof createServerClient>, personId: string): Promise<boolean | null> {
  const { data: staff, error } = await sb
    .from('person_accounts').select('is_active').eq('person_id', personId).eq('is_active', true).limit(1)
  if (error) return null
  if (staff && staff.length > 0) return true
  // student_credentials нет в сгенерированных типах БД.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cred, error: cErr } = await (sb as any)
    .from('student_credentials').select('is_active').eq('person_id', personId).eq('is_active', true).limit(1)
  if (cErr) return isMissingTable(cErr) ? false : null
  return Array.isArray(cred) && cred.length > 0
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim()
  const personId = token ? await verifyFeedToken(token) : null
  if (!personId) return new NextResponse('Invalid or expired feed token', { status: 404 })

  const sb = createServerClient()

  // Токен живёт год и сам не знает, что аккаунт отключили: без этой проверки
  // уволенный сотрудник ещё год видел бы свой календарь (названия и заметки
  // событий) в Google. Нет активного входа (сотрудника или портала) — фид
  // больше не отдаём.
  const active = await hasActiveLogin(sb, personId)
  if (active === null) return new NextResponse('Temporarily unavailable', { status: 503 })
  if (!active) return new NextResponse('Invalid or expired feed token', { status: 404 })

  const from = addDaysUTC(todayISO(), -30)
  const to = addDaysUTC(todayISO(), 180)
  const events: IcsEvent[] = []

  // Личные события календаря (owner_id = пользователь). Деплой-safe к 42P01.
  try {
    const { data } = await sb
      .from('calendar_events')
      .select('id, title, notes, event_date, event_time, all_day')
      .eq('owner_id', personId)
      .gte('event_date', from).lte('event_date', to)
      .order('event_date', { ascending: true })
      .limit(2000)
    events.push(...personalEventsToIcs((data ?? []) as FeedEventRow[]))
  } catch { /* нет таблицы — пропускаем слой */ }

  // Встречи — тот же набор, что календарь в приложении (api/calendar/appointments):
  //   • созданные пользователем (provider_id = он);
  //   • назначенные ему как студентке (journey_id ∈ его journeys);
  //   • куда его пригласили (appointment_attendees.person_id = он), КРОМЕ
  //     приглашений, которые он отклонил.
  // Отменённые не включаем; одна встреча = одно событие (дедуп по id).
  try {
    const APPT_COLS = 'id, title, reason, starts_at, ends_at, status'
    const startFrom = `${from}T00:00:00`
    const startTo = `${to}T23:59:59.999`
    const rows: FeedApptRow[] = []

    const own = await sb.from('appointments').select(APPT_COLS)
      .eq('provider_id', personId)
      .gte('starts_at', startFrom).lte('starts_at', startTo)
      .order('starts_at', { ascending: true }).limit(2000)
    rows.push(...((own.data ?? []) as FeedApptRow[]))

    const { data: journeys } = await sb.from('education_journeys').select('id').eq('person_id', personId)
    const journeyIds = (journeys ?? []).map(j => (j as { id: string }).id)
    // .in() с пустым массивом не запускаем.
    for (const ids of chunk(journeyIds)) {
      const { data } = await sb.from('appointments').select(APPT_COLS)
        .in('journey_id', ids)
        .gte('starts_at', startFrom).lte('starts_at', startTo)
        .order('starts_at', { ascending: true }).limit(2000)
      rows.push(...((data ?? []) as FeedApptRow[]))
    }

    // appointment_attendees нет в сгенерированных типах БД. Нет таблицы → пусто.
    const declined = new Set<string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const att = await (sb as any).from('appointment_attendees')
      .select('appointment_id, status').eq('person_id', personId)
    if (!att.error && Array.isArray(att.data)) {
      const invitedIds: string[] = []
      for (const r of att.data as Array<{ appointment_id: string; status: string | null }>) {
        if (r.status === 'declined') declined.add(r.appointment_id)
        else invitedIds.push(r.appointment_id)
      }
      for (const ids of chunk([...new Set(invitedIds)])) {
        const { data } = await sb.from('appointments').select(APPT_COLS)
          .in('id', ids)
          .gte('starts_at', startFrom).lte('starts_at', startTo)
          .order('starts_at', { ascending: true })
        rows.push(...((data ?? []) as FeedApptRow[]))
      }
    }

    // Отклонённое приглашение исключаем, только если встреча не своя
    // (создатель всегда видит свою встречу).
    const ownIds = new Set(((own.data ?? []) as FeedApptRow[]).map(a => a.id))
    const skip = new Set([...declined].filter(id => !ownIds.has(id)))
    events.push(...appointmentsToIcs(rows, skip))
  } catch { /* нет таблицы — пропускаем слой */ }

  // Открытые ЗАДАЧИ пользователя со сроком — в календаре приложения они видны,
  // и именно их владелец ожидал увидеть в Google («мוסיף משימות ליומן» — фид
  // без задач выглядел ПУСТЫМ). Терминальные статусы не включаем.
  try {
    const { data } = await sb
      .from('tasks')
      .select('id, title, due_date, due_time, due_all_day, status')
      .eq('assignee_id', personId)
      .in('status', [...OPEN_TASK_STATUSES])
      .gte('due_date', from).lte('due_date', to)
      .order('due_date', { ascending: true })
      .limit(2000)
    events.push(...tasksToIcs((data ?? []) as unknown as FeedTaskRow[]))
  } catch { /* нет таблицы — пропускаем слой */ }

  // Уроки учебных групп пользователя: где он преподаватель ИЛИ записан
  // студенткой (resolveMyClassGroupIds — тот же источник, что у календаря в
  // приложении). Только СВОИ группы: «все группы», которые superadmin видит в
  // приложении, в личный Google-календарь не выгружаем. Отменённые не включаем.
  try {
    const groupIds = await resolveMyClassGroupIds(sb, personId)
    const lessonRows: Array<{
      id: string; class_group_id: string; scheduled_date: string
      scheduled_time: string | null; scheduled_end_time: string | null
      location: string | null; topic: string | null; is_cancelled: boolean | null
    }> = []
    for (const ids of chunk(groupIds)) {
      let offset = 0
      for (;;) {
        const { data, error } = await sb.from('lessons')
          .select('id, class_group_id, scheduled_date, scheduled_time, scheduled_end_time, location, topic, is_cancelled')
          .in('class_group_id', ids)
          .gte('scheduled_date', from).lte('scheduled_date', to)
          .order('scheduled_date', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + PAGE - 1)
        if (error) throw error
        // scheduled_end_time в типах БД — unknown (колонка из 20260715140000).
        const page = (data ?? []) as unknown as typeof lessonRows
        lessonRows.push(...page)
        if (page.length < PAGE) break
        offset += PAGE
      }
    }
    if (lessonRows.length > 0) {
      const usedGroupIds = [...new Set(lessonRows.map(l => l.class_group_id))]
      const groupById = new Map<string, { name: string | null; subject_id: string | null }>()
      for (const ids of chunk(usedGroupIds)) {
        const { data } = await sb.from('class_groups').select('id, name, subject_id').in('id', ids)
        for (const g of (data ?? []) as Array<{ id: string; name: string | null; subject_id: string | null }>) {
          groupById.set(g.id, { name: g.name, subject_id: g.subject_id })
        }
      }
      // null subject_id в .in() → 22P02, поэтому фильтруем (см. api/calendar/lessons).
      const subjectIds = [...new Set([...groupById.values()].map(g => g.subject_id).filter((x): x is string => !!x))]
      const subjectById = new Map<string, { name: string | null; name_he: string | null }>()
      for (const ids of chunk(subjectIds)) {
        const { data } = await sb.from('subjects').select('id, name, name_he').in('id', ids)
        for (const s of (data ?? []) as Array<{ id: string; name: string | null; name_he: string | null }>) {
          subjectById.set(s.id, { name: s.name, name_he: s.name_he })
        }
      }
      events.push(...lessonsToIcs(lessonRows.map(l => {
        const g = groupById.get(l.class_group_id)
        const s = g?.subject_id ? subjectById.get(g.subject_id) : undefined
        return { ...l, group_name: g?.name ?? null, subject_he: s?.name_he ?? null, subject: s?.name ?? null }
      })))
    }
  } catch { /* нет таблицы/ошибка — пропускаем слой */ }

  const ics = buildICS({ name: 'יומן הקמפוס — מכון חמש', events })
  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="campus.ics"',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
