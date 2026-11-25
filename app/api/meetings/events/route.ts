import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import { isIsoDate } from '@/lib/calendar/validation'
import { db, canManageCalendar, personNames } from '@/lib/meetings/access'
import { notifyCalendarTeam } from '@/lib/meetings/server'
import { cleanText, cleanEventTime, isUuid } from '@/lib/meetings/rules'
import { meetingsError } from '@/lib/meetings/http'

/**
 * POST /api/meetings/events — добавить событие в календарь владельца
 * (сам владелец или его секретарь, מזכירת המנהל). Решение владельца 25.11.2026.
 *   { owner_id, title, event_date, event_time? }  — без event_time → «весь день».
 * Только название и время: заметок и ссылок секретарь не пишет. created_by —
 * кто добавил (секретарь потом может править/удалять только свои события).
 * Владелец получает уведомление, когда событие добавила секретарь.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const body = await request.json().catch(() => ({})) as {
      owner_id?: unknown; title?: unknown; event_date?: unknown; event_time?: unknown
    }
    const ownerId = typeof body.owner_id === 'string' && body.owner_id ? body.owner_id : session.person_id
    if (!isUuid(ownerId)) return meetingsError('invalid_input')
    const sb = createServerClient()
    const role = await canManageCalendar(sb, session, ownerId)
    if (!role) return apiError('forbidden', 403)

    const title = cleanText(body.title, 300)
    if (title === undefined) return meetingsError('invalid_input')
    if (!title) return meetingsError('subject_required')
    if (typeof body.event_date !== 'string' || !isIsoDate(body.event_date)) return meetingsError('invalid_time')
    const time = cleanEventTime(body.event_time)
    if (time === undefined) return meetingsError('invalid_time')

    const { data, error } = await db(sb).from('calendar_events').insert({
      owner_id: ownerId,
      title,
      notes: null,
      event_date: body.event_date,
      event_time: time,
      all_day: !time,
      source_type: 'manual',
      created_by: session.person_id,
    }).select('id').single()
    if (error) throw error

    if (role === 'delegate') {
      const names = await personNames(sb, [session.person_id])
      await notifyCalendarTeam(sb, ownerId, session.person_id, {
        title: `נוסף ליומן: ${title}`,
        body: `${body.event_date}${time ? ` ${time}` : ''} · ${names.get(session.person_id) ?? ''}`,
        link: '/dashboard/calendar',
      })
    }
    return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
