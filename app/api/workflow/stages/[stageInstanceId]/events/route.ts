import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'

type Params = { params: { stageInstanceId: string } }

async function getJourneyFromStage(sb: ReturnType<typeof createServerClient>, stageInstanceId: string) {
  const { data } = await sb
    .from('stage_instances')
    .select('process_instance:process_instances(journey_id)')
    .eq('id', stageInstanceId)
    .maybeSingle()
  const journeyId = (data?.process_instance as unknown as { journey_id: string } | null)?.journey_id ?? null
  if (!journeyId) return null

  const { data: journey } = await sb
    .from('education_journeys')
    .select('education_status, primary_department_id')
    .eq('id', journeyId)
    .maybeSingle()
  return journey as { education_status: string; primary_department_id: string | null } | null
}

function viewPrivilegeFor(status: string): 'view_leads' | 'view_applicants' | 'view_students' {
  if (status === 'applicant') return 'view_applicants'
  if (status === 'student') return 'view_students'
  return 'view_leads'
}

function managePrivilegeFor(status: string): 'manage_leads' | 'manage_applicants' | 'manage_students' {
  if (status === 'applicant') return 'manage_applicants'
  if (status === 'student') return 'manage_students'
  return 'manage_leads'
}

/**
 * GET /api/workflow/stages/[stageInstanceId]/events
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const sb = createServerClient()
    const journey = await getJourneyFromStage(sb, params.stageInstanceId)
    if (!journey) return apiError('substage_not_found', 404)

    const canView = await hasEducationPrivilege(session, viewPrivilegeFor(journey.education_status), {
      department_id: journey.primary_department_id ?? undefined,
    })
    if (!canView) return apiError('forbidden', 403)

    const { data, error } = await sb
      .from('process_events')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('id, event_type, content, author_id, metadata, created_at, author:persons!process_events_author_id_fkey(full_name)' as any)
      .eq('stage_instance_id', params.stageInstanceId)
      .order('created_at', { ascending: true })

    if (error) throw error

    type RawEvent = {
      id: string; event_type: string; content: string;
      author_id: string | null; metadata: unknown; created_at: string;
      author: { full_name: string } | null;
    }

    const result = (data ?? []).map((ev: RawEvent) => ({
      id: ev.id,
      event_type: ev.event_type,
      content: ev.content,
      author_id: ev.author_id,
      author_name: ev.author?.full_name ?? null,
      metadata: ev.metadata,
      created_at: ev.created_at,
    }))

    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/**
 * POST /api/workflow/stages/[stageInstanceId]/events
 * Body: { event_type, content, metadata? }
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const body = await req.json() as { event_type?: string; content?: string; metadata?: unknown }

    const MANUAL_TYPES = ['note', 'call', 'meeting', 'message', 'email']
    if (!body.event_type || !MANUAL_TYPES.includes(body.event_type)) {
      return apiError('invalid_event_type', 400)
    }
    if (!body.content?.trim()) {
      return apiError('event_text_required', 400)
    }

    const sb = createServerClient()
    const journey = await getJourneyFromStage(sb, params.stageInstanceId)
    if (!journey) return apiError('substage_not_found', 404)

    const canManage = await hasEducationPrivilege(session, managePrivilegeFor(journey.education_status), {
      department_id: journey.primary_department_id ?? undefined,
    })
    if (!canManage) return apiError('forbidden', 403)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await sb.from('process_events').insert({
      stage_instance_id: params.stageInstanceId,
      event_type: body.event_type,
      content: body.content.trim(),
      author_id: session.person_id,
      metadata: body.metadata ?? null,
    } as any)
    if (error) throw error

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
