import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import { createNotifications } from '@/lib/notifications/create'
import { db, loadMeeting, personNames } from '@/lib/meetings/access'
import { cleanText, isUuid } from '@/lib/meetings/rules'
import { meetingsError } from '@/lib/meetings/http'

/**
 * POST /api/meetings/[id]/shares { recipient_id, content } — передать часть
 * информации другому человеку (מחנכת, פנימייה, לימודים…), не раскрывая
 * остальной סיכום. Получатель видит ТОЛЬКО этот текст + тему и дату встречи
 * (экран «פגישות» → «הועבר אליי»). Только владелец.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params
    const session = await requireCalendarUser()
    const sb = createServerClient()
    const m = await loadMeeting(sb, session, id)
    if (!m) return apiError('meeting_not_found', 404)
    if (!m.relation.isOwner) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { recipient_id?: unknown; content?: unknown }
    if (!isUuid(body.recipient_id) || body.recipient_id === session.person_id) return meetingsError('invalid_input')
    const content = cleanText(body.content, 10000)
    if (!content) return meetingsError(content === undefined ? 'invalid_input' : 'subject_required')

    const { data, error } = await db(sb).from('appointment_shares').insert({
      appointment_id: id, recipient_id: body.recipient_id, content, created_by: session.person_id,
    }).select('id').single()
    if (error) throw error

    const names = await personNames(sb, [session.person_id])
    await createNotifications(sb, [{
      person_id: body.recipient_id, type: 'meeting',
      title: `${names.get(session.person_id) ?? ''} העביר/ה אליך מידע מפגישה`,
      body: m.row.title, link: '/dashboard/meetings?tab=shared',
    }])
    return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
