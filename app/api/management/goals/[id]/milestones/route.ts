import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import { db, notMigrated, canEditGoal, syncMilestoneCalendar, type GoalRow, type MilestoneRow } from '@/lib/management/store'
import { cleanText, isIsoDateStr } from '@/lib/management/validation'

/**
 * POST /api/management/goals/[id]/milestones — добавить אבן דרך:
 * { title, due_date?, owner_id? }. Право — как на правку מטרה. Срок попадает
 * в личный календарь ответственного (или ответственного за מטרה).
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await requireCalendarUser()
    const sb = db()
    const { data: goal, error: gErr } = await sb.from('management_goals').select('*').eq('id', params.id).maybeSingle()
    if (gErr) {
      if (notMigrated(gErr)) return apiError('feature_not_migrated', 503)
      throw gErr
    }
    if (!goal) return apiError('not_found', 404)
    if (!canEditGoal(session, goal as GoalRow)) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const title = cleanText(body.title, 300)
    if (!title) return apiError('title_field_required', 400)
    const due = body.due_date == null || body.due_date === '' ? null : body.due_date
    if (due !== null && !isIsoDateStr(due)) return apiError('date_required', 400)
    const owner = typeof body.owner_id === 'string' && body.owner_id !== '' ? body.owner_id : null

    const { count } = await sb.from('management_goal_milestones').select('id', { count: 'exact', head: true }).eq('goal_id', params.id)
    const { data: ms, error } = await sb.from('management_goal_milestones')
      .insert({ goal_id: params.id, title, due_date: due, owner_id: owner, sort_order: count ?? 0 })
      .select('*').single()
    if (error) {
      if (error.code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    await syncMilestoneCalendar(sb, ms as MilestoneRow, goal as GoalRow, session.person_id)
    return NextResponse.json({ milestone: ms }, { status: 201 })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
