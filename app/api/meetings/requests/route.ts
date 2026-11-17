import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import { isMissingTable } from '@/lib/supabase/errors'
import { db, managedOwnerIds } from '@/lib/meetings/access'
import { createRequest, withNames, REQUEST_COLS, type RequestRow } from '@/lib/meetings/requests'
import { meetingsError } from '@/lib/meetings/http'

/**
 * GET  /api/meetings/requests →
 *   incoming — заявки в календари, которые я веду (свой + те, где я секретарь);
 *   mine     — мои собственные заявки.
 * POST /api/meetings/requests { owner_id, subject, details?, preferred_times? }
 *   — сотрудник просит встречу. Студентка просит из портала (/api/portal/meeting-requests).
 */
export async function GET() {
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()
    const owners = [session.person_id, ...(await managedOwnerIds(sb, session.person_id))]

    const [inc, mine] = await Promise.all([
      db(sb).from('appointment_requests').select(REQUEST_COLS).in('owner_id', owners).order('created_at', { ascending: false }).limit(300),
      db(sb).from('appointment_requests').select(REQUEST_COLS).eq('requester_id', session.person_id).order('created_at', { ascending: false }).limit(100),
    ])
    if (inc.error || mine.error) {
      const e = inc.error ?? mine.error
      if (isMissingTable(e)) return NextResponse.json({ incoming: [], mine: [] })
      throw e
    }
    return NextResponse.json({
      incoming: await withNames(sb, (inc.data ?? []) as RequestRow[]),
      mine: await withNames(sb, (mine.data ?? []) as RequestRow[]),
    })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const sb = createServerClient()
    const r = await createRequest(sb, {
      ownerId: body.owner_id,
      requesterId: session.person_id,
      journeyId: null,
      subject: body.subject,
      details: body.details,
      preferredTimes: body.preferred_times,
    })
    if (!r.ok) return meetingsError(r.error)
    return NextResponse.json({ id: r.id }, { status: 201 })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
