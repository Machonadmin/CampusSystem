import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { mapDbError } from '@/lib/tasks/helpers'
import { getTaskAccess } from '@/lib/tasks/access'
import { createNotifications } from '@/lib/notifications/create'
import type { TaskRow, TaskUpdate, TaskStatus, TaskPriority } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  return session
}

const ALLOWED_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  unassigned:  ['cancelled'],
  pending:     ['in_progress', 'declined', 'cancelled'],
  in_progress: ['review', 'completed', 'declined', 'cancelled', 'pending'],
  review:      ['completed', 'in_progress', 'cancelled'],
  completed:   [],
  cancelled:   [],
  declined:    ['pending', 'cancelled'],
}

// ─── GET /api/tasks/[id] ──────────────────────────────────────────────────────
// Возвращает задачу + комментарии + watchers + история + объект access.
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    const { data: task, error: taskErr } = await sb
      .from('tasks')
      .select(`
        *,
        assignee:persons!tasks_assignee_id_fkey(id, full_name),
        creator:persons!tasks_creator_id_fkey(id, full_name),
        department:departments(id, name)
      `)
      .eq('id', params.id)
      .maybeSingle()

    if (taskErr) throw taskErr
    if (!task) return apiError('task_not_found', 404)

    const access = await getTaskAccess(task as unknown as TaskRow, session.person_id, session.roles ?? [])
    if (!access.canView) return apiError('no_access_to_task', 403)

    const [
      { data: comments, error: cErr },
      { data: watchers, error: wErr },
      { data: history, error: hErr },
    ] = await Promise.all([
      sb.from('task_comments')
        .select('*, author:persons!task_comments_author_id_fkey(id, full_name)')
        .eq('task_id', params.id)
        .order('created_at', { ascending: true }),
      sb.from('task_watchers')
        .select('*, person:persons!task_watchers_person_id_fkey(id, full_name)')
        .eq('task_id', params.id)
        .order('added_at', { ascending: true }),
      sb.from('task_status_history')
        .select('*, actor:persons!task_status_history_actor_id_fkey(id, full_name)')
        .eq('task_id', params.id)
        .order('created_at', { ascending: false }),
    ])

    if (cErr ?? wErr ?? hErr) throw cErr ?? wErr ?? hErr

    return NextResponse.json({
      task,
      comments: comments ?? [],
      watchers: watchers ?? [],
      history: history ?? [],
      access,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) { const m = mapDbError(e); return NextResponse.json({ error: m.message }, { status: m.status }) }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

// ─── PATCH /api/tasks/[id] ────────────────────────────────────────────────────
// Изменение полей (canEdit) и/или смена статуса (canChangeStatus).
// При смене статуса пишется запись в task_status_history.
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    const body = await request.json() as {
      title?: string
      description?: string | null
      priority?: TaskPriority
      due_date?: string | null
      due_time?: string | null
      due_all_day?: boolean
      status?: TaskStatus
      status_note?: string
      assignee_id?: string | null
      assignee_type?: 'person' | 'department'
      department_id?: string | null
    }

    const { data: task, error: tErr } = await sb
      .from('tasks')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()
    if (tErr) throw tErr
    if (!task) return apiError('task_not_found', 404)

    const access = await getTaskAccess(task as unknown as TaskRow, session.person_id, session.roles ?? [])
    if (!access.canView) return apiError('no_access_to_task', 403)

    const update: TaskUpdate = {}

    // ─── Поля, требующие canEdit ───────────────────────────────────────────────
    const EDIT_KEYS = ['title', 'description', 'priority', 'due_date', 'due_time', 'due_all_day', 'assignee_id', 'assignee_type', 'department_id'] as const
    const hasEditFields = EDIT_KEYS.some(k => k in body)

    if (hasEditFields) {
      if (!access.canEdit) {
        return apiError('only_author_can_edit_task', 403)
      }
      if (body.title !== undefined) {
        const t = body.title?.trim()
        if (!t) return apiError('heading_not_empty', 400)
        if (t.length > 500) return apiError('heading_too_long', 400)
        update.title = t
      }
      if (body.description !== undefined) update.description = body.description?.trim() || null
      if (body.priority !== undefined) update.priority = body.priority
      if (body.due_date !== undefined) update.due_date = body.due_date
      if (body.due_time !== undefined) update.due_time = body.due_time
      if (body.due_all_day !== undefined) update.due_all_day = body.due_all_day
      if (body.assignee_id !== undefined) update.assignee_id = body.assignee_id
      if (body.assignee_type !== undefined) update.assignee_type = body.assignee_type
      if (body.department_id !== undefined) update.department_id = body.department_id
    }

    // ─── Смена статуса ─────────────────────────────────────────────────────────
    let statusChange: { from: TaskStatus; to: TaskStatus } | null = null

    if (body.status !== undefined && body.status !== task.status) {
      if (!access.canChangeStatus) {
        return apiError('only_author_or_assignee_status', 403)
      }
      const currentStatus = task.status as TaskStatus
      const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? []
      if (!allowed.includes(body.status)) {
        return NextResponse.json(
          { error: `Переход ${currentStatus} → ${body.status} запрещён` },
          { status: 400 }
        )
      }
      if (body.status === 'declined' && !access.isAssignee && !access.isSuperadmin) {
        return apiError('only_assignee_can_release', 403)
      }
      if (body.status === 'cancelled' && !access.isCreator && !access.isSuperadmin) {
        return apiError('only_author_can_cancel_task', 403)
      }
      update.status = body.status
      statusChange = { from: currentStatus, to: body.status }
      if (body.status === 'completed') {
        update.completed_at = new Date().toISOString()
      } else if (currentStatus === 'completed') {
        update.completed_at = null
      }
    }

    if (Object.keys(update).length === 0) {
      return apiError('no_changes', 400)
    }

    const { data: updated, error: uErr } = await sb
      .from('tasks')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(update as any)
      .eq('id', params.id)
      .select('*')
      .single()

    if (uErr) { const m = mapDbError(uErr); return NextResponse.json({ error: m.message }, { status: m.status }) }

    if (statusChange) {
      await sb.from('task_status_history').insert({
        task_id: params.id,
        actor_id: session.person_id,
        from_status: statusChange.from,
        to_status: statusChange.to,
        note: body.status_note?.trim() || null,
      })

      // Уведомляем «другую сторону» о смене статуса (best-effort).
      const creatorId = (task as { creator_id: string | null }).creator_id
      const assigneeId = (task as { assignee_id: string | null }).assignee_id
      const recipient = session.person_id === creatorId ? assigneeId : creatorId
      const TITLE_HE: Partial<Record<TaskStatus, string>> = {
        review:      'משימה נשלחה לבדיקתך',
        completed:   'המשימה הושלמה',
        declined:    'משימה נדחתה',
        cancelled:   'משימה בוטלה',
        in_progress: 'המשימה הוחזרה אליך',
      }
      const heading = TITLE_HE[statusChange.to]
      if (recipient && recipient !== session.person_id && heading) {
        await createNotifications(sb, [{
          person_id: recipient,
          type: 'task_status',
          title: `${heading}: ${(task as { title: string }).title}`,
          link: `/dashboard/tasks/${params.id}`,
          metadata: { task_id: params.id, status: statusChange.to },
        }])
      }

      // Дублируем заметку смены статуса в общий фид комментариев, чтобы она
      // не «терялась» (видна только в истории). Ошибка вставки не должна
      // валить уже выполненную смену статуса.
      const note = body.status_note?.trim()
      if (note) {
        const { error: cErr } = await sb.from('task_comments').insert({
          task_id: params.id,
          author_id: session.person_id,
          content: note,
          comment_type: 'status_note',
        })
        if (cErr) console.error('[tasks PATCH] не удалось продублировать заметку в комментарии:', cErr)
      }
    }

    // Завершение задачи → активировать следующие задачи подэтапа, атомарно
    // через RPC handle_task_completion (см. migrations/20260702220000_*.sql).
    // Ошибки перехода не должны валить уже выполненную смену статуса.
    if (statusChange?.to === 'completed') {
      const { error: chainErr } = await sb.rpc('handle_task_completion', {
        p_task_id: params.id,
        p_actor_id: session.person_id,
      })
      if (chainErr) {
        console.error('[handle_task_completion] не удалось активировать следующие задачи:', chainErr)
      }
    }

    return NextResponse.json(updated)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) { const m = mapDbError(e); return NextResponse.json({ error: m.message }, { status: m.status }) }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

// ─── DELETE /api/tasks/[id] ───────────────────────────────────────────────────
// Только автор или суперадмин. Каскадно удаляет связанные записи (ON DELETE CASCADE).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    const { data: task, error: tErr } = await sb
      .from('tasks')
      .select('id, creator_id')
      .eq('id', params.id)
      .maybeSingle()
    if (tErr) throw tErr
    if (!task) return apiError('task_not_found', 404)

    const isCreator = task.creator_id === session.person_id
    const isSuperadmin = session.roles?.includes('superadmin') ?? false
    if (!isCreator && !isSuperadmin) {
      return apiError('only_author_can_delete_task', 403)
    }

    const { error: dErr } = await sb.from('tasks').delete().eq('id', params.id)
    if (dErr) throw dErr

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) { const m = mapDbError(e); return NextResponse.json({ error: m.message }, { status: m.status }) }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
