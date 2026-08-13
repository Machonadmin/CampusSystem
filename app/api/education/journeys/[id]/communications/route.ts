import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'

/**
 * Журнал коммуникаций лида/абитуриента/студента на УРОВНЕ journey.
 *
 * process_events живут на уровне подэтапа (stage_instance_id). Этот эндпоинт
 * АГРЕГИРУЕТ их по всем процессам journey — чтобы карточка показывала единую
 * ленту общения (звонки/встречи/сообщения/письма/заметки), не «зарытую» в
 * выбор конкретного подэтапа. POST добавляет ручную запись, привязывая её к
 * активному подэтапу (иначе — к самому свежему), поскольку колонка требует
 * stage_instance_id.
 */

type Params = { params: { id: string } }

const MANUAL_TYPES = ['note', 'call', 'meeting', 'message', 'email']

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

async function loadJourney(sb: ReturnType<typeof createServerClient>, journeyId: string) {
  const { data } = await sb
    .from('education_journeys')
    .select('id, education_status, primary_department_id')
    .eq('id', journeyId)
    .maybeSingle()
  return data as { id: string; education_status: string; primary_department_id: string | null } | null
}

/** Все stage_instance_id journey + id активного/самого свежего подэтапа для POST. */
async function collectStages(sb: ReturnType<typeof createServerClient>, journeyId: string) {
  const { data: pis } = await sb
    .from('process_instances')
    .select('id, status')
    .eq('journey_id', journeyId)
  const procIds = (pis ?? []).map(p => p.id as string)
  if (procIds.length === 0) return { stageIds: [] as string[], targetStageId: null as string | null }

  const { data: stages } = await sb
    .from('stage_instances')
    .select('id, status, process_instance_id, created_at')
    .in('process_instance_id', procIds)
    .order('created_at', { ascending: false })
  const list = (stages ?? []) as Array<{ id: string; status: string; process_instance_id: string; created_at: string }>

  const activeProc = new Set((pis ?? []).filter(p => p.status === 'active').map(p => p.id as string))
  // Цель для POST: активный подэтап активного процесса → иначе самый свежий подэтап.
  const target =
    list.find(s => s.status === 'active' && activeProc.has(s.process_instance_id))?.id ??
    list[0]?.id ?? null

  return { stageIds: list.map(s => s.id), targetStageId: target }
}

/** GET — единая лента коммуникаций journey (новые сверху). */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const sb = createServerClient()
    const journey = await loadJourney(sb, params.id)
    if (!journey) return apiError('not_found', 404)

    const canView = await hasEducationPrivilege(session, viewPrivilegeFor(journey.education_status), {
      department_id: journey.primary_department_id ?? undefined,
    })
    if (!canView) return apiError('forbidden', 403)

    const { stageIds } = await collectStages(sb, params.id)
    if (stageIds.length === 0) return NextResponse.json([])

    const { data, error } = await sb
      .from('process_events')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('id, event_type, content, author_id, metadata, created_at, author:persons!process_events_author_id_fkey(full_name)' as any)
      .in('stage_instance_id', stageIds)
      .order('created_at', { ascending: false })
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

/** POST — ручная запись коммуникации. Body: { event_type, content }. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const body = await req.json() as { event_type?: string; content?: string }
    if (!body.event_type || !MANUAL_TYPES.includes(body.event_type)) {
      return apiError('invalid_event_type', 400)
    }
    if (!body.content?.trim()) {
      return apiError('event_text_required', 400)
    }

    const sb = createServerClient()
    const journey = await loadJourney(sb, params.id)
    if (!journey) return apiError('not_found', 404)

    const canManage = await hasEducationPrivilege(session, managePrivilegeFor(journey.education_status), {
      department_id: journey.primary_department_id ?? undefined,
    })
    if (!canManage) return apiError('forbidden', 403)

    const { targetStageId } = await collectStages(sb, params.id)
    if (!targetStageId) return apiError('substage_not_found', 404)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await sb.from('process_events').insert({
      stage_instance_id: targetStageId,
      event_type: body.event_type,
      content: body.content.trim(),
      author_id: session.person_id,
      metadata: null,
    } as any)
    if (error) throw error

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
