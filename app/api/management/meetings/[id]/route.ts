import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import {
  db, canSeeMeeting, canEditMeeting, notMigrated, replaceCalendarItems, syncMeetingCalendar, type MeetingRow,
} from '@/lib/management/store'
import { cleanText, isIsoDateStr, isTimeStr } from '@/lib/management/validation'

/**
 * GET    /api/management/meetings/[id] — אסיפה (видят создатель/участники/superadmin).
 * PATCH  — правка (создатель/superadmin): title, meeting_date, meeting_time,
 *          summary, decisions, attendee_ids (заменяет весь список).
 * DELETE — удалить (создатель/superadmin); מטרות остаются, отвязываются.
 */

async function load(id: string) {
  const sb = db()
  const { data, error } = await sb.from('management_meetings').select('*').eq('id', id).maybeSingle()
  if (error) {
    if (notMigrated(error)) return { sb, err: apiError('feature_not_migrated', 503) }
    throw error
  }
  if (!data) return { sb, err: apiError('not_found', 404) }
  return { sb, meeting: data as MeetingRow }
}

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await requireCalendarUser()
    const r = await load(params.id)
    if (r.err) return r.err
    if (!(await canSeeMeeting(r.sb, session, r.meeting))) return apiError('forbidden', 403)
    return NextResponse.json({ meeting: r.meeting, can_edit: canEditMeeting(session, r.meeting) })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await requireCalendarUser()
    const r = await load(params.id)
    if (r.err) return r.err
    if (!canEditMeeting(session, r.meeting)) return apiError('forbidden', 403)
    const sb = r.sb
    const body = await request.json().catch(() => ({})) as Record<string, unknown>

    const update: Record<string, unknown> = {}
    if ('title' in body) {
      const t = cleanText(body.title, 300)
      if (!t) return apiError('title_field_required', 400)
      update.title = t
    }
    if ('meeting_date' in body) {
      if (!isIsoDateStr(body.meeting_date)) return apiError('date_required', 400)
      update.meeting_date = body.meeting_date
    }
    if ('meeting_time' in body) {
      const time = body.meeting_time == null || body.meeting_time === '' ? null : body.meeting_time
      if (time !== null && !isTimeStr(time)) return apiError('invalid_time', 400)
      update.meeting_time = time
    }
    if ('summary' in body) update.summary = cleanText(body.summary, 20000)
    if ('decisions' in body) update.decisions = cleanText(body.decisions, 20000)

    let meeting = r.meeting
    if (Object.keys(update).length > 0) {
      const { data, error } = await sb.from('management_meetings').update(update).eq('id', params.id).select('*').single()
      if (error) throw error
      meeting = data as MeetingRow
    }

    let attendeeIds: string[]
    if (Array.isArray(body.attendee_ids)) {
      attendeeIds = [...new Set(body.attendee_ids.filter((x): x is string => typeof x === 'string'))].slice(0, 100)
      const { error: dErr } = await sb.from('management_meeting_attendees').delete().eq('meeting_id', params.id)
      if (dErr) throw dErr
      if (attendeeIds.length > 0) {
        const { error: iErr } = await sb.from('management_meeting_attendees')
          .insert(attendeeIds.map(person_id => ({ meeting_id: params.id, person_id })))
        if (iErr) {
          if (iErr.code === '23503') return apiError('invalid_reference', 400)
          throw iErr
        }
      }
    } else {
      const { data: att } = await sb.from('management_meeting_attendees').select('person_id').eq('meeting_id', params.id)
      attendeeIds = ((att ?? []) as Array<{ person_id: string }>).map(a => a.person_id)
    }

    await syncMeetingCalendar(sb, meeting, attendeeIds, session.person_id)
    return NextResponse.json({ meeting })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await requireCalendarUser()
    const r = await load(params.id)
    if (r.err) return r.err
    if (!canEditMeeting(session, r.meeting)) return apiError('forbidden', 403)
    const { error } = await r.sb.from('management_meetings').delete().eq('id', params.id)
    if (error) throw error
    await replaceCalendarItems(r.sb, 'meeting', params.id, '', [], session.person_id)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
