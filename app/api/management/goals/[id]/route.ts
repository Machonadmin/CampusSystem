import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import {
  db, notMigrated, canEditGoal, canSeeMeeting, replaceCalendarItems, syncGoalCalendar, syncMilestoneCalendar,
  type GoalRow, type MilestoneRow, type MeetingRow,
} from '@/lib/management/store'
import { parseGoalInput } from '@/lib/management/goal-input'

/**
 * PATCH  /api/management/goals/[id] — правка מטרה (создатель/ответственный/superadmin).
 * DELETE /api/management/goals/[id] — удалить вместе с אבני דרך и событиями календаря.
 */

async function loadGoal(id: string) {
  const sb = db()
  const { data, error } = await sb.from('management_goals').select('*').eq('id', id).maybeSingle()
  if (error) {
    if (notMigrated(error)) return { sb, err: apiError('feature_not_migrated', 503) }
    throw error
  }
  if (!data) return { sb, err: apiError('not_found', 404) }
  return { sb, goal: data as GoalRow }
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await requireCalendarUser()
    const r = await loadGoal(params.id)
    if (r.err) return r.err
    if (!canEditGoal(session, r.goal)) return apiError('forbidden', 403)
    const sb = r.sb
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const parsed = parseGoalInput(body, true)
    if ('error' in parsed) return apiError(parsed.error, 400)
    const fields = parsed.fields
    if (Object.keys(fields).length === 0) return NextResponse.json({ goal: r.goal })

    if (typeof fields.meeting_id === 'string' && fields.meeting_id !== r.goal.meeting_id) {
      const { data: m } = await sb.from('management_meetings').select('*').eq('id', fields.meeting_id).maybeSingle()
      if (!m || !(await canSeeMeeting(sb, session, m as MeetingRow))) return apiError('invalid_reference', 400)
    }

    const { data: goal, error } = await sb.from('management_goals').update(fields).eq('id', params.id).select('*').single()
    if (error) {
      if (error.code === '23503') return apiError('invalid_reference', 400)
      if (error.code === '23514') return apiError('goal_dates_order', 400)
      throw error
    }
    const g = goal as GoalRow
    await syncGoalCalendar(sb, g, session.person_id)
    // Статус/ответственный меняют и события אבני דרך (закрытая מטרה — без событий).
    if ('status' in fields || 'owner_id' in fields || 'title' in fields) {
      const { data: ms } = await sb.from('management_goal_milestones').select('*').eq('goal_id', g.id)
      for (const m of (ms ?? []) as MilestoneRow[]) await syncMilestoneCalendar(sb, m, g, session.person_id)
    }
    return NextResponse.json({ goal: g })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await requireCalendarUser()
    const r = await loadGoal(params.id)
    if (r.err) return r.err
    if (!canEditGoal(session, r.goal)) return apiError('forbidden', 403)
    const sb = r.sb
    const { data: ms } = await sb.from('management_goal_milestones').select('id').eq('goal_id', params.id)
    const { error } = await sb.from('management_goals').delete().eq('id', params.id)
    if (error) throw error
    await replaceCalendarItems(sb, 'goal', params.id, '', [], session.person_id)
    for (const m of (ms ?? []) as Array<{ id: string }>) {
      await replaceCalendarItems(sb, 'goal_milestone', m.id, '', [], session.person_id)
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
