import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireModuleUser } from '@/lib/modules/personal-access'
import { errorResponse } from '@/lib/api/handler'
import { isIsoDate } from '@/lib/calendar/validation'
import { db, loadMeeting } from '@/lib/meetings/access'
import { openTaskForItem } from '@/lib/meetings/server'
import { cleanText, isUuid } from '@/lib/meetings/rules'
import { meetingsError } from '@/lib/meetings/http'

/**
 * POST /api/meetings/[id]/items — החלטה או משימה после встречи (только владелец).
 *   { kind: 'decision'|'task', text, assignee_id?, due_date? }
 * Если указан ответственный — у него АВТОМАТИЧЕСКИ открывается задача
 * (tasks, metadata.appointment_id) и приходит уведомление.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params
    const session = await requireModuleUser('meetings')
    const sb = createServerClient()
    const m = await loadMeeting(sb, session, id)
    if (!m) return apiError('meeting_not_found', 404)
    if (!m.visibility.manageContent) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { kind?: unknown; text?: unknown; assignee_id?: unknown; due_date?: unknown }
    const kind = body.kind === 'decision' ? 'decision' : 'task'
    const text = cleanText(body.text, 500)
    if (!text) return meetingsError(text === undefined ? 'invalid_input' : 'subject_required')
    const assigneeId = body.assignee_id === null || body.assignee_id === undefined || body.assignee_id === '' ? null : body.assignee_id
    if (assigneeId !== null && !isUuid(assigneeId)) return meetingsError('invalid_input')
    const dueDate = body.due_date === null || body.due_date === undefined || body.due_date === '' ? null : body.due_date
    if (dueDate !== null && (typeof dueDate !== 'string' || !isIsoDate(dueDate))) return meetingsError('invalid_input')

    const { count } = await db(sb).from('appointment_action_items').select('id', { count: 'exact', head: true }).eq('appointment_id', id)

    let taskId: string | null = null
    if (assigneeId) {
      taskId = await openTaskForItem(sb, {
        creatorId: session.person_id,
        assigneeId: assigneeId as string,
        text,
        dueDate: dueDate as string | null,
        meeting: { id, title: m.row.title, starts_at: m.row.starts_at },
      })
    }

    const { data, error } = await db(sb).from('appointment_action_items').insert({
      appointment_id: id, kind, text, assignee_id: assigneeId, due_date: dueDate, task_id: taskId,
      sort_order: count ?? 0, created_by: session.person_id,
    }).select('id').single()
    if (error) throw error
    return NextResponse.json({ id: (data as { id: string }).id, task_id: taskId, task_failed: !!assigneeId && !taskId }, { status: 201 })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
