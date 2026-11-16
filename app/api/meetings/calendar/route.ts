import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import { isIsoDate } from '@/lib/calendar/validation'
import { db, canManageCalendar, personNames } from '@/lib/meetings/access'
import { ownerMeetings, attendeesFor, studentsFor, dayBusy, bookMeeting, notifyCalendarTeam } from '@/lib/meetings/server'
import { meetingVisibility, redactMeeting, cleanText, isValidRange, isUuid } from '@/lib/meetings/rules'
import { meetingsError } from '@/lib/meetings/http'
import { createNotifications } from '@/lib/notifications/create'

/**
 * Календарь владельца глазами владельца или его секретаря (מזכירת המנהל).
 *
 * GET  ?owner=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD[&day=YYYY-MM-DD]
 *   → { role, meetings[], day? }  — встречи с участниками; секретарю содержание
 *     НЕ отдаётся (только время, участники, тема), если владелец не открыл его
 *     для конкретной встречи. day — занятость и свободные окна этого дня.
 * POST { owner_id, title, starts_at, ends_at, attendee_person_ids?, prep_notes? }
 *   → назначить встречу в календарь владельца. Защита от двойного бронирования:
 *     пересечение с его встречами, уроками, выходным днём → 409.
 */

export async function GET(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const sp = request.nextUrl.searchParams
    const ownerId = sp.get('owner') || session.person_id
    const from = sp.get('from') ?? ''
    const to = sp.get('to') ?? ''
    const day = sp.get('day')
    if (!isIsoDate(from) || !isIsoDate(to)) return apiError('from_must_be_date', 400)
    if (day && !isIsoDate(day)) return apiError('from_must_be_date', 400)

    const sb = createServerClient()
    const role = await canManageCalendar(sb, session, ownerId)
    if (!role) return apiError('forbidden', 403)

    const rows = await ownerMeetings(sb, ownerId, from, to)
    const ids = rows.map(r => r.id)

    // Встречи, содержание которых владелец открыл этому секретарю.
    let opened = new Set<string>()
    if (role === 'delegate' && ids.length > 0) {
      const { data } = await db(sb).from('appointment_content_viewers').select('appointment_id')
        .eq('person_id', session.person_id).in('appointment_id', ids)
      opened = new Set(((data ?? []) as Array<{ appointment_id: string }>).map(r => r.appointment_id))
    }

    const [att, students] = await Promise.all([attendeesFor(sb, ids), studentsFor(sb, rows.map(r => r.journey_id))])
    const meetings = rows.map(r => {
      const v = meetingVisibility({ isOwner: role === 'owner', isDelegate: role === 'delegate', isContentViewer: opened.has(r.id) })
      const st = r.journey_id ? students.get(r.journey_id) : undefined
      return {
        ...redactMeeting(r, v),
        attendees: att.get(r.id) ?? [],
        student: st ? { journey_id: r.journey_id, person_id: st.person_id, name: st.name } : null,
        can_see_content: v.content,
      }
    })

    return NextResponse.json({ role, meetings, day: day ? await dayBusy(sb, ownerId, day) : null })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const body = await request.json().catch(() => ({})) as {
      owner_id?: unknown; title?: unknown; starts_at?: unknown; ends_at?: unknown
      attendee_person_ids?: unknown; prep_notes?: unknown
    }
    const ownerId = typeof body.owner_id === 'string' && body.owner_id ? body.owner_id : session.person_id
    const sb = createServerClient()
    const role = await canManageCalendar(sb, session, ownerId)
    if (!role) return apiError('forbidden', 403)

    const title = cleanText(body.title, 300)
    if (title === undefined) return meetingsError('invalid_input')
    if (!title) return meetingsError('subject_required')
    if (!isValidRange(body.starts_at, body.ends_at)) return meetingsError('invalid_time')
    const prep = cleanText(body.prep_notes, 4000)
    if (prep === undefined) return meetingsError('invalid_input')
    const attendeeIds = Array.isArray(body.attendee_person_ids)
      ? [...new Set(body.attendee_person_ids.filter(isUuid))].filter(id => id !== ownerId).slice(0, 30)
      : []

    const booked = await bookMeeting(sb, {
      ownerId,
      createdBy: session.person_id,
      title,
      startsAt: body.starts_at as string,
      endsAt: body.ends_at as string,
      prepNotes: prep,
      attendees: attendeeIds.map(person_id => ({ person_id, status: 'invited' as const })),
    })
    if (!booked.ok) return meetingsError(booked.reason, booked.time)

    // Владелец узнаёт о встрече, которую поставила секретарь; приглашённые — о приглашении.
    if (role === 'delegate') {
      const names = await personNames(sb, [session.person_id])
      await notifyCalendarTeam(sb, ownerId, session.person_id, {
        title: `נקבעה פגישה: ${title}`,
        body: `${(body.starts_at as string).replace('T', ' ')} · ${names.get(session.person_id) ?? ''}`,
        link: `/dashboard/meetings/${booked.id}`,
      })
    }
    if (attendeeIds.length > 0) {
      await createNotifications(sb, attendeeIds.map(person_id => ({
        person_id, type: 'meeting', title: `הזמנה לפגישה: ${title}`,
        body: (body.starts_at as string).replace('T', ' '), link: '/dashboard/calendar',
      })))
    }

    return NextResponse.json({ id: booked.id }, { status: 201 })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
