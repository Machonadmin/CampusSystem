import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'

/**
 * GET /api/education/journeys/[id]/timeline — единая хронология по абитуриентке/
 * студентке: смены статуса, подписи этапов приёма, загруженные документы и
 * заметки — отсортированы по времени (новые сверху). Право: view_applicants /
 * view_students или superadmin.
 */

interface TimelineItem {
  at: string
  type: 'status' | 'signature' | 'document' | 'note'
  // общие/специфичные поля
  actor?: string | null
  from_status?: string | null
  to_status?: string | null
  stage_code?: string | null
  final_code?: string | null
  signer_name?: string | null
  title?: string | null
  doc_type?: string | null
  content?: string | null
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const sb = createServerClient()

    // journey → person + подразделение (для проверки прав) + процессы/этапы приёма.
    const { data: journey } = await sb
      .from('education_journeys')
      .select('id, person_id, primary_department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (!journey) return apiError('journey_not_found', 404)
    const personId = (journey as { person_id: string }).person_id
    const dept = (journey as { primary_department_id?: string | null }).primary_department_id ?? null
    const target = dept ? { department_id: dept } : undefined

    const allowed = session.roles.includes('superadmin')
      || await hasEducationPrivilege(session, 'view_applicants', target)
      || await hasEducationPrivilege(session, 'view_students', target)
    if (!allowed) return apiError('forbidden', 403)

    const { data: pis } = await sb
      .from('process_instances')
      .select('id, process_template:process_templates!inner(code)')
      .eq('journey_id', params.id)
      .eq('process_template.code', 'acceptance')
    const instanceIds = (pis ?? []).map(p => p.id)

    let stageIdToCode = new Map<string, string>()
    if (instanceIds.length > 0) {
      const { data: si } = await sb
        .from('stage_instances')
        .select('id, stage_template:stage_templates!inner(code)')
        .in('process_instance_id', instanceIds)
      for (const s of (si ?? []) as unknown as Array<{ id: string; stage_template: { code: string } | null }>) {
        stageIdToCode.set(s.id, s.stage_template?.code ?? '')
      }
    }
    const stageIds = [...stageIdToCode.keys()]

    const [{ data: statuses }, { data: sigs }, { data: docs }, notesRes] = await Promise.all([
      sb.from('person_status_history').select('from_status, to_status, changed_at, changed_by, comment').eq('person_id', personId),
      stageIds.length > 0
        ? sb.from('stage_signatures').select('stage_instance_id, signer_name, signed_via, final_code, signed_at').in('stage_instance_id', stageIds)
        : Promise.resolve({ data: [] as Array<{ stage_instance_id: string; signer_name: string; signed_via: string; final_code: string | null; signed_at: string }> }),
      sb.from('document_records').select('title, doc_type, created_at, created_by').eq('journey_id', params.id),
      stageIds.length > 0
        ? sb.from('process_events').select('content, event_type, created_at, author_id, stage_instance_id').in('stage_instance_id', stageIds).eq('event_type', 'note')
        : Promise.resolve({ data: [] as Array<{ content: string; event_type: string; created_at: string; author_id: string | null }> }),
    ])
    const notes = notesRes.data ?? []

    // Имена акторов.
    const actorIds = [...new Set([
      ...(statuses ?? []).map(s => (s as { changed_by: string | null }).changed_by),
      ...(docs ?? []).map(d => (d as { created_by: string | null }).created_by),
      ...notes.map(n => (n as { author_id: string | null }).author_id),
    ].filter(Boolean) as string[])]
    const nameById = new Map<string, string>()
    if (actorIds.length > 0) {
      const { data: persons } = await sb.from('persons').select('id, full_name').in('id', actorIds)
      for (const p of (persons ?? []) as Array<{ id: string; full_name: string | null }>) nameById.set(p.id, p.full_name ?? '')
    }

    const items: TimelineItem[] = []
    for (const s of (statuses ?? []) as Array<{ from_status: string | null; to_status: string; changed_at: string; changed_by: string | null; comment: string | null }>) {
      items.push({ at: s.changed_at, type: 'status', from_status: s.from_status, to_status: s.to_status, actor: s.changed_by ? nameById.get(s.changed_by) ?? null : null })
    }
    for (const s of (sigs ?? []) as Array<{ stage_instance_id: string; signer_name: string; signed_via: string; final_code: string | null; signed_at: string }>) {
      items.push({ at: s.signed_at, type: 'signature', stage_code: stageIdToCode.get(s.stage_instance_id) ?? null, final_code: s.final_code, signer_name: s.signer_name })
    }
    for (const d of (docs ?? []) as Array<{ title: string; doc_type: string; created_at: string; created_by: string | null }>) {
      items.push({ at: d.created_at, type: 'document', title: d.title, doc_type: d.doc_type, actor: d.created_by ? nameById.get(d.created_by) ?? null : null })
    }
    for (const n of notes as Array<{ content: string; created_at: string; author_id: string | null }>) {
      items.push({ at: n.created_at, type: 'note', content: n.content, actor: n.author_id ? nameById.get(n.author_id) ?? null : null })
    }

    items.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))

    return NextResponse.json({ items })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
