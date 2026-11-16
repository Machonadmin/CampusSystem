import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import { db, loadMeeting } from '@/lib/meetings/access'
import { isUuid } from '@/lib/meetings/rules'

/**
 * PUT /api/meetings/[id]/viewers { person_ids: string[] } — владелец выбирает,
 * кто видит СОДЕРЖАНИЕ этой встречи (פירוט, סיכום, החלטות ומשימות). Список
 * заменяется целиком. הערה חסויה не открывается никому никогда.
 */
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params
    const session = await requireCalendarUser()
    const sb = createServerClient()
    const m = await loadMeeting(sb, session, id)
    if (!m) return apiError('meeting_not_found', 404)
    if (!m.relation.isOwner) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { person_ids?: unknown }
    if (!Array.isArray(body.person_ids)) return apiError('meetings_invalid_input', 400)
    const ids = [...new Set(body.person_ids.filter(isUuid))].filter(pid => pid !== session.person_id).slice(0, 50)

    const { error: dErr } = await db(sb).from('appointment_content_viewers').delete().eq('appointment_id', id)
    if (dErr) throw dErr
    if (ids.length > 0) {
      const { error } = await db(sb).from('appointment_content_viewers')
        .insert(ids.map(person_id => ({ appointment_id: id, person_id, created_by: session.person_id })))
      if (error) throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
