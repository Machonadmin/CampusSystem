import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import { isMissingTable } from '@/lib/supabase/errors'
import { db, canManageCalendar, personNames } from '@/lib/meetings/access'

/**
 * GET /api/meetings/tasks?owner=<id> — מעקב משימות: все החלטות/משימות со
 * встреч владельца, у которых открыта задача, со статусом задачи и сроком.
 * Владелец или его секретарь (מזכירת המנהל ведёт задачи до завершения).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const ownerId = request.nextUrl.searchParams.get('owner') || session.person_id
    const sb = createServerClient()
    if (!(await canManageCalendar(sb, session, ownerId))) return apiError('forbidden', 403)

    // Встречи владельца (только id/тема/дата) → их пункты с задачами.
    const { data: appts, error: aErr } = await db(sb).from('appointments').select('id, title, starts_at').eq('provider_id', ownerId)
    if (aErr) throw aErr
    const meta = new Map<string, { title: string; starts_at: string }>()
    for (const a of (appts ?? []) as Array<{ id: string; title: string; starts_at: string }>) meta.set(a.id, a)
    const ids = [...meta.keys()]
    if (ids.length === 0) return NextResponse.json({ tasks: [] })

    const items: Array<{ id: string; appointment_id: string; kind: string; text: string; assignee_id: string | null; due_date: string | null; task_id: string | null }> = []
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db(sb).from('appointment_action_items')
        .select('id, appointment_id, kind, text, assignee_id, due_date, task_id')
        .in('appointment_id', ids.slice(i, i + 200)).not('task_id', 'is', null)
      if (error) {
        if (isMissingTable(error)) return NextResponse.json({ tasks: [] })
        throw error
      }
      items.push(...(data ?? []))
    }

    const taskIds = items.map(r => r.task_id as string)
    const taskById = new Map<string, { status: string; due_date: string | null; completed_at: string | null }>()
    for (let i = 0; i < taskIds.length; i += 200) {
      const { data } = await db(sb).from('tasks').select('id, status, due_date, completed_at').in('id', taskIds.slice(i, i + 200))
      for (const t of (data ?? []) as Array<{ id: string; status: string; due_date: string | null; completed_at: string | null }>) taskById.set(t.id, t)
    }
    const names = await personNames(sb, items.map(r => r.assignee_id))

    const tasks = items.map(r => {
      const t = r.task_id ? taskById.get(r.task_id) : undefined
      const m = meta.get(r.appointment_id)
      return {
        item_id: r.id,
        task_id: r.task_id,
        kind: r.kind,
        text: r.text,
        assignee_name: r.assignee_id ? names.get(r.assignee_id) ?? '' : '',
        due_date: t?.due_date ?? r.due_date,
        status: t?.status ?? 'deleted',
        completed_at: t?.completed_at ?? null,
        meeting_id: r.appointment_id,
        meeting_title: m?.title ?? '',
        meeting_starts_at: m?.starts_at ?? null,
      }
    }).sort((a, b) => (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1)

    return NextResponse.json({ tasks })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
