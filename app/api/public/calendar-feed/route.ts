import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { verifyFeedToken } from '@/lib/calendar/feed-token'
import { buildICS, toFloating, type IcsEvent } from '@/lib/calendar/ics'
import { todayISO } from '@/lib/dates'
import { OPEN_TASK_STATUSES } from '@/lib/tasks/status'

/**
 * GET /api/public/calendar-feed?token=... — iCal (.ics) подписка на календарь
 * пользователя. Публичный (под PUBLIC_API_PREFIXES): Google Calendar тянет URL
 * без cookie. Авторизация — подписанным фид-токеном (capability): person_id
 * берётся из него, невалидный/просроченный → 404.
 *
 * Область фида (MVP «пробный» по решению владельца): личные события календаря +
 * встречи, где пользователь — provider, в окне [сегодня-30д … сегодня+180д].
 */

export const dynamic = 'force-dynamic'

function addDaysUTC(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

type EventRow = {
  id: string; title: string | null; notes: string | null
  event_date: string; event_time: string | null; all_day: boolean | null
}
type ApptRow = {
  id: string; title: string | null; reason: string | null
  starts_at: string; ends_at: string; status: string | null
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim()
  const personId = token ? await verifyFeedToken(token) : null
  if (!personId) return new NextResponse('Invalid or expired feed token', { status: 404 })

  const from = addDaysUTC(todayISO(), -30)
  const to = addDaysUTC(todayISO(), 180)
  const sb = createServerClient()
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
    for (const e of (data ?? []) as EventRow[]) {
      const summary = e.title ?? '(ללא כותרת)'
      const description = e.notes ?? undefined
      if (e.all_day || !e.event_time) {
        events.push({ uid: `event-${e.id}@campus`, summary, description, kind: 'allday', date: e.event_date })
      } else {
        events.push({ uid: `event-${e.id}@campus`, summary, description, kind: 'floating', start: toFloating(e.event_date, e.event_time) })
      }
    }
  } catch { /* нет таблицы — пропускаем слой */ }

  // Встречи, где пользователь — provider (создал сам). Отменённые не включаем.
  try {
    const { data } = await sb
      .from('appointments')
      .select('id, title, reason, starts_at, ends_at, status')
      .eq('provider_id', personId)
      .gte('starts_at', `${from}T00:00:00`).lte('starts_at', `${to}T23:59:59`)
      .order('starts_at', { ascending: true })
      .limit(2000)
    for (const a of (data ?? []) as ApptRow[]) {
      if (a.status === 'cancelled') continue
      events.push({
        uid: `appt-${a.id}@campus`,
        summary: a.title ?? 'פגישה',
        description: a.reason ?? undefined,
        kind: 'utc', start: new Date(a.starts_at), end: new Date(a.ends_at),
      })
    }
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
    type TaskRow = { id: string; title: string | null; due_date: string; due_time: string | null; due_all_day: boolean | null }
    for (const tk of (data ?? []) as unknown as TaskRow[]) {
      const summary = `✓ ${tk.title ?? ''}`.trim()
      if (tk.due_all_day || !tk.due_time) {
        events.push({ uid: `task-${tk.id}@campus`, summary, kind: 'allday', date: tk.due_date })
      } else {
        events.push({ uid: `task-${tk.id}@campus`, summary, kind: 'floating', start: toFloating(tk.due_date, tk.due_time) })
      }
    }
  } catch { /* нет таблицы — пропускаем слой */ }

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
