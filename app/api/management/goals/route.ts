import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import {
  db, isSuperadmin, notMigrated, canEditGoal, canSeeMeeting, syncGoalCalendar, type GoalRow, type MilestoneRow, type MeetingRow,
} from '@/lib/management/store'
import { personNames } from '@/lib/management/people'
import { parseGoalInput } from '@/lib/management/goal-input'

/**
 * פאנל ניהול — מטרות.
 *
 * GET  /api/management/goals[?meeting_id=] — מטרות, которые я вижу: создатель,
 *      ответственный, ответственный за אבן דרך, участник אסיפה, где её поставили;
 *      superadmin — все. С אבני דרך.
 * POST /api/management/goals — { title, description?, owner_id?, meeting_id?,
 *      start_date?, target_date?, progress? }. Срок попадает в личный календарь
 *      ответственного.
 */

export async function GET(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const sb = db()
    const me = session.person_id
    const meetingFilter = request.nextUrl.searchParams.get('meeting_id')

    let q = sb.from('management_goals').select('*')
      .order('status', { ascending: true }).order('target_date', { ascending: true, nullsFirst: false }).limit(1000)
    if (meetingFilter) q = q.eq('meeting_id', meetingFilter)

    if (!isSuperadmin(session)) {
      const { data: ms, error: mErr } = await sb.from('management_goal_milestones').select('goal_id').eq('owner_id', me)
      if (mErr) {
        if (notMigrated(mErr)) return NextResponse.json({ goals: [] })
        throw mErr
      }
      const { data: att } = await sb.from('management_meeting_attendees').select('meeting_id').eq('person_id', me)
      const goalIds = [...new Set(((ms ?? []) as Array<{ goal_id: string }>).map(r => r.goal_id))]
      const meetIds = [...new Set(((att ?? []) as Array<{ meeting_id: string }>).map(r => r.meeting_id))]
      const ors = [`created_by.eq.${me}`, `owner_id.eq.${me}`]
      if (goalIds.length > 0) ors.push(`id.in.(${goalIds.join(',')})`)
      if (meetIds.length > 0) ors.push(`meeting_id.in.(${meetIds.join(',')})`)
      q = q.or(ors.join(','))
    }

    const { data: goals, error } = await q
    if (error) {
      if (notMigrated(error)) return NextResponse.json({ goals: [] })
      throw error
    }
    const list = (goals ?? []) as GoalRow[]
    const ids = list.map(g => g.id)

    const msBy = new Map<string, MilestoneRow[]>()
    if (ids.length > 0) {
      const { data: ms } = await sb.from('management_goal_milestones').select('*').in('goal_id', ids)
        .order('sort_order', { ascending: true }).order('due_date', { ascending: true, nullsFirst: false })
      for (const m of (ms ?? []) as MilestoneRow[]) msBy.set(m.goal_id, [...(msBy.get(m.goal_id) ?? []), m])
    }
    const meetIds = [...new Set(list.map(g => g.meeting_id).filter((x): x is string => !!x))]
    const meetTitle = new Map<string, string>()
    if (meetIds.length > 0) {
      const { data: mts } = await sb.from('management_meetings').select('id, title, meeting_date').in('id', meetIds)
      for (const m of (mts ?? []) as Array<{ id: string; title: string }>) meetTitle.set(m.id, m.title)
    }
    const names = await personNames(sb, [
      ...list.map(g => g.owner_id), ...list.map(g => g.created_by),
      ...[...msBy.values()].flat().map(m => m.owner_id),
    ])

    return NextResponse.json({
      goals: list.map(g => ({
        ...g,
        owner_name: g.owner_id ? names.get(g.owner_id) ?? null : null,
        created_by_name: g.created_by ? names.get(g.created_by) ?? null : null,
        meeting_title: g.meeting_id ? meetTitle.get(g.meeting_id) ?? null : null,
        can_edit: canEditGoal(session, g),
        milestones: (msBy.get(g.id) ?? []).map(m => ({ ...m, owner_name: m.owner_id ? names.get(m.owner_id) ?? null : null })),
      })),
    })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const parsed = parseGoalInput(body, false)
    if ('error' in parsed) return apiError(parsed.error, 400)
    const fields = parsed.fields
    const sb = db()

    // Привязать к אסיפה можно только к той, которую видишь.
    if (typeof fields.meeting_id === 'string') {
      const { data: m, error: mErr } = await sb.from('management_meetings').select('*').eq('id', fields.meeting_id).maybeSingle()
      if (mErr) {
        if (notMigrated(mErr)) return apiError('feature_not_migrated', 503)
        throw mErr
      }
      if (!m || !(await canSeeMeeting(sb, session, m as MeetingRow))) return apiError('invalid_reference', 400)
    }

    const { data: goal, error } = await sb.from('management_goals')
      .insert({ ...fields, owner_id: fields.owner_id ?? session.person_id, created_by: session.person_id })
      .select('*').single()
    if (error) {
      if (notMigrated(error)) return apiError('feature_not_migrated', 503)
      if (error.code === '23503') return apiError('invalid_reference', 400)
      if (error.code === '23514') return apiError('goal_dates_order', 400)
      throw error
    }
    await syncGoalCalendar(sb, goal as GoalRow, session.person_id)
    return NextResponse.json({ goal }, { status: 201 })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
