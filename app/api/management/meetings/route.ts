import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import { db, isSuperadmin, notMigrated, syncMeetingCalendar, type MeetingRow } from '@/lib/management/store'
import { personNames } from '@/lib/management/people'
import { cleanText, isIsoDateStr, isTimeStr } from '@/lib/management/validation'

/**
 * פאנל ניהול — אסיפות.
 *
 * GET  /api/management/meetings — אסיפות, которые я вижу (создатель/участник;
 *      superadmin — все), свежие сверху, с участниками и числом מטרות.
 * POST /api/management/meetings — { title, meeting_date, meeting_time?, summary?,
 *      decisions?, attendee_ids?: string[] }. Дата попадает в личный календарь
 *      создателя и участников.
 * Только сотрудники (не портал). Deploy-safe: без таблиц → пусто / 503.
 */

export async function GET() {
  try {
    const session = await requireCalendarUser()
    const sb = db()

    let meetingIds: string[] | null = null
    if (!isSuperadmin(session)) {
      const { data: att, error: aErr } = await sb.from('management_meeting_attendees')
        .select('meeting_id').eq('person_id', session.person_id)
      if (aErr) {
        if (notMigrated(aErr)) return NextResponse.json({ meetings: [] })
        throw aErr
      }
      const { data: own, error: oErr } = await sb.from('management_meetings')
        .select('id').eq('created_by', session.person_id)
      if (oErr) throw oErr
      meetingIds = [...new Set([...(att ?? []).map((r: { meeting_id: string }) => r.meeting_id), ...(own ?? []).map((r: { id: string }) => r.id)])]
      if (meetingIds.length === 0) return NextResponse.json({ meetings: [] })
    }

    let q = sb.from('management_meetings').select('*')
      .order('meeting_date', { ascending: false }).order('created_at', { ascending: false }).limit(500)
    if (meetingIds) q = q.in('id', meetingIds)
    const { data: meetings, error } = await q
    if (error) {
      if (notMigrated(error)) return NextResponse.json({ meetings: [] })
      throw error
    }
    const list = (meetings ?? []) as MeetingRow[]
    const ids = list.map(m => m.id)

    const attBy = new Map<string, string[]>()
    const goalsBy = new Map<string, number>()
    if (ids.length > 0) {
      const { data: att } = await sb.from('management_meeting_attendees').select('meeting_id, person_id').in('meeting_id', ids)
      for (const r of (att ?? []) as Array<{ meeting_id: string; person_id: string }>) {
        attBy.set(r.meeting_id, [...(attBy.get(r.meeting_id) ?? []), r.person_id])
      }
      const { data: goals } = await sb.from('management_goals').select('meeting_id').in('meeting_id', ids)
      for (const g of (goals ?? []) as Array<{ meeting_id: string }>) goalsBy.set(g.meeting_id, (goalsBy.get(g.meeting_id) ?? 0) + 1)
    }
    const names = await personNames(sb, [...list.map(m => m.created_by), ...[...attBy.values()].flat()])

    return NextResponse.json({
      meetings: list.map(m => ({
        ...m,
        created_by_name: m.created_by ? names.get(m.created_by) ?? null : null,
        attendees: (attBy.get(m.id) ?? []).map(id => ({ id, name: names.get(id) ?? '—' })),
        goals_count: goalsBy.get(m.id) ?? 0,
        can_edit: isSuperadmin(session) || m.created_by === session.person_id,
      })),
    })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const body = await request.json().catch(() => ({})) as Record<string, unknown>

    const title = cleanText(body.title, 300)
    if (!title) return apiError('title_field_required', 400)
    if (!isIsoDateStr(body.meeting_date)) return apiError('date_required', 400)
    const time = body.meeting_time == null || body.meeting_time === '' ? null : body.meeting_time
    if (time !== null && !isTimeStr(time)) return apiError('invalid_time', 400)
    const attendeeIds = Array.isArray(body.attendee_ids)
      ? [...new Set(body.attendee_ids.filter((x): x is string => typeof x === 'string'))].slice(0, 100)
      : []

    const sb = db()
    const { data: meeting, error } = await sb.from('management_meetings').insert({
      title,
      meeting_date: body.meeting_date,
      meeting_time: time,
      summary: cleanText(body.summary, 20000),
      decisions: cleanText(body.decisions, 20000),
      created_by: session.person_id,
    }).select('*').single()
    if (error) {
      if (notMigrated(error)) return apiError('feature_not_migrated', 503)
      throw error
    }

    if (attendeeIds.length > 0) {
      const { error: aErr } = await sb.from('management_meeting_attendees')
        .insert(attendeeIds.map(person_id => ({ meeting_id: meeting.id, person_id })))
      if (aErr) {
        // Откатываем אסיפה, чтобы не осталось записи без участников.
        const { error: _delErr } = await sb.from('management_meetings').delete().eq('id', meeting.id)
        if (aErr.code === '23503') return apiError('invalid_reference', 400)
        throw aErr
      }
    }
    await syncMeetingCalendar(sb, meeting as MeetingRow, attendeeIds, session.person_id)
    return NextResponse.json({ meeting }, { status: 201 })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
