import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import {
  db, notMigrated, canEditGoal, replaceCalendarItems, syncMilestoneCalendar, type GoalRow, type MilestoneRow,
} from '@/lib/management/store'
import { cleanText, isIsoDateStr } from '@/lib/management/validation'

/**
 * PATCH  /api/management/milestones/[id] — { title?, due_date?, owner_id?, done?: boolean }.
 *        Право: правка מטרה или ответственный за саму אבן דרך (он может отметить «בוצע»).
 * DELETE /api/management/milestones/[id] — право как на правку מטרה.
 */

async function loadPair(id: string) {
  const sb = db()
  const { data: ms, error } = await sb.from('management_goal_milestones').select('*').eq('id', id).maybeSingle()
  if (error) {
    if (notMigrated(error)) return { sb, err: apiError('feature_not_migrated', 503) }
    throw error
  }
  if (!ms) return { sb, err: apiError('not_found', 404) }
  const { data: goal, error: gErr } = await sb.from('management_goals').select('*').eq('id', (ms as MilestoneRow).goal_id).single()
  if (gErr) throw gErr
  return { sb, ms: ms as MilestoneRow, goal: goal as GoalRow }
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await requireCalendarUser()
    const r = await loadPair(params.id)
    if (r.err) return r.err
    const editGoal = canEditGoal(session, r.goal)
    const isMsOwner = r.ms.owner_id === session.person_id
    if (!editGoal && !isMsOwner) return apiError('forbidden', 403)
    const body = await request.json().catch(() => ({})) as Record<string, unknown>

    const update: Record<string, unknown> = {}
    if ('done' in body) update.done_at = body.done === true ? new Date().toISOString() : null
    // Остальные поля — только тот, кто правит מטרה.
    if (editGoal) {
      if ('title' in body) {
        const t = cleanText(body.title, 300)
        if (!t) return apiError('title_field_required', 400)
        update.title = t
      }
      if ('due_date' in body) {
        const due = body.due_date == null || body.due_date === '' ? null : body.due_date
        if (due !== null && !isIsoDateStr(due)) return apiError('date_required', 400)
        update.due_date = due
      }
      if ('owner_id' in body) update.owner_id = typeof body.owner_id === 'string' && body.owner_id !== '' ? body.owner_id : null
    }
    if (Object.keys(update).length === 0) return NextResponse.json({ milestone: r.ms })

    const { data, error } = await r.sb.from('management_goal_milestones').update(update).eq('id', params.id).select('*').single()
    if (error) {
      if (error.code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    await syncMilestoneCalendar(r.sb, data as MilestoneRow, r.goal, session.person_id)
    return NextResponse.json({ milestone: data })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await requireCalendarUser()
    const r = await loadPair(params.id)
    if (r.err) return r.err
    if (!canEditGoal(session, r.goal)) return apiError('forbidden', 403)
    const { error } = await r.sb.from('management_goal_milestones').delete().eq('id', params.id)
    if (error) throw error
    await replaceCalendarItems(r.sb, 'goal_milestone', params.id, '', [], session.person_id)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
