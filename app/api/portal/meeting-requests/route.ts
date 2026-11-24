import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { errorResponse } from '@/lib/api/handler'
import { isMissingTable } from '@/lib/supabase/errors'
import { db, requestTargetIds, personNames } from '@/lib/meetings/access'
import { createRequest, REQUEST_COLS, type RequestRow } from '@/lib/meetings/requests'
import { meetingsError } from '@/lib/meetings/http'

/**
 * Портал студентки: בקשה לפגישה.
 *   GET  → { targets: [{ id, name }], requests: [...] } — к кому можно обратиться
 *          и мои заявки (без внутренних пометок: кто обработал — не отдаётся).
 *   POST { owner_id, subject, details?, preferred_times? } — новая заявка.
 * Только principal='student'; journey берётся ИЗ СЕССИИ, не из тела.
 */

async function requirePortalStudent() {
  const session = await getSession()
  if (!session) return { err: apiError('unauthorized', 401) }
  if (session.principal !== 'student' || !session.student_journey_id) return { err: apiError('forbidden', 403) }
  return { personId: session.person_id, journeyId: session.student_journey_id }
}

export async function GET() {
  try {
    const g = await requirePortalStudent()
    if ('err' in g) return g.err
    const sb = createServerClient()
    const targets = await requestTargetIds(sb)
    const { data, error } = await db(sb).from('appointment_requests').select(REQUEST_COLS)
      .eq('requester_id', g.personId).order('created_at', { ascending: false }).limit(50)
    if (error && !isMissingTable(error)) throw error
    const rows = (data ?? []) as RequestRow[]
    const names = await personNames(sb, [...targets, ...rows.map(r => r.owner_id)])
    // Время назначенной встречи — чтобы студентка видела, на когда её поставили.
    const apptIds = rows.map(r => r.appointment_id).filter((x): x is string => !!x)
    const apptTime = new Map<string, { starts_at: string; ends_at: string; status: string }>()
    if (apptIds.length > 0) {
      const { data: appts } = await db(sb).from('appointments').select('id, starts_at, ends_at, status').in('id', apptIds)
      for (const a of (appts ?? []) as Array<{ id: string; starts_at: string; ends_at: string; status: string }>) apptTime.set(a.id, a)
    }
    return NextResponse.json({
      targets: targets.map(id => ({ id, name: names.get(id) ?? '' })),
      requests: rows.map(r => ({
        id: r.id, owner_name: names.get(r.owner_id) ?? '', subject: r.subject, details: r.details,
        preferred_times: r.preferred_times, status: r.status,
        proposed_starts_at: r.proposed_starts_at, proposed_ends_at: r.proposed_ends_at,
        response_note: r.response_note, created_at: r.created_at,
        meeting: r.appointment_id ? apptTime.get(r.appointment_id) ?? null : null,
      })),
    })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await requirePortalStudent()
    if ('err' in g) return g.err
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const sb = createServerClient()
    const r = await createRequest(sb, {
      ownerId: body.owner_id, requesterId: g.personId, journeyId: g.journeyId,
      subject: body.subject, details: body.details, preferredTimes: body.preferred_times,
    })
    if (!r.ok) return meetingsError(r.error)
    return NextResponse.json({ id: r.id }, { status: 201 })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
