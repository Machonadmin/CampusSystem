import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireFeaturePrivilege, type FeatureAction } from '@/lib/auth/feature-privileges'
import { jsonError } from '@/lib/api/handler'

/** completed-записи относятся к вкладке/фиче 'history', остальные — 'planned'. */
function featureForStatus(status: string): 'planned' | 'history' {
  return status === 'completed' ? 'history' : 'planned'
}

async function requireQcAccess(sb: ReturnType<typeof createServerClient>, id: string, action: FeatureAction) {
  const { data: row, error } = await sb
    .from('quality_checks')
    .select('status')
    .eq('id', id)
    .single()
  if (error || !row) throw Object.assign(new Error(serverT('not_found')), { status: 404 })

  await requireFeaturePrivilege('quality_control', featureForStatus(row.status), action)
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = createServerClient()
    await requireQcAccess(sb, params.id, 'can_view')

    const { data: check, error } = await sb
      .from('quality_checks')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) throw error
    if (!check) return apiError('not_found', 404)

    const personIds = [check.observer_person_id, check.teacher_person_id].filter(Boolean)
    const { data: persons } = await sb
      .from('persons')
      .select('id, full_name')
      .in('id', personIds)

    const pm = new Map((persons ?? []).map(p => [p.id, p.full_name]))
    return NextResponse.json({
      ...check,
      observer_name: pm.get(check.observer_person_id) ?? null,
      teacher_name: pm.get(check.teacher_person_id) ?? null,
    })
  } catch (err: unknown) {
    return jsonError(err)
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = createServerClient()
    await requireQcAccess(sb, params.id, 'can_edit')
    const body = await request.json() as Record<string, unknown>

    const allowed = [
      'template_id', 'lesson_date', 'lesson_time', 'observer_person_id', 'teacher_person_id',
      'group_name', 'course_name', 'started_on_time', 'delay_minutes', 'delay_reason',
      'technical_issues', 'answers', 'strengths', 'areas_for_improvement', 'action_item',
      'overall_rating', 'teacher_feedback', 'status', 'completed_at',
    ]
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }

    if (update.status === 'completed' && !update.completed_at) {
      update.completed_at = new Date().toISOString()
    }

    const { data, error } = await sb
      .from('quality_checks')
      .update(update)
      .eq('id', params.id)
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    return jsonError(err)
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = createServerClient()
    await requireQcAccess(sb, params.id, 'can_delete')

    const { error } = await sb
      .from('quality_checks')
      .delete()
      .eq('id', params.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
