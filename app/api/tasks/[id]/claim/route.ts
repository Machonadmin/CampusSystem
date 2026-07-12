import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getPersonDepartments, mapDbError } from '@/lib/tasks/helpers'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  return session
}

/**
 * POST /api/tasks/[id]/claim — взять задачу из пула отдела на себя.
 *
 * Условия:
 *   - Задача должна быть в статусе 'unassigned'
 *   - Пользователь должен быть в отделе задачи (или суперадмин)
 *
 * Эффект:
 *   - assignee_type → 'person'
 *   - assignee_id → person_id текущего пользователя
 *   - status → 'in_progress' (сразу в работу — раз взял, значит делаешь)
 *   - claimed_at → NOW()
 *   - Запись в task_status_history
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const personId = session.person_id
    const isSuperadmin = session.roles?.includes('superadmin') ?? false
    const sb = createServerClient()

    // Необязательный комментарий при взятии задачи (по аналогии с PATCH)
    let statusNote = ''
    try {
      const body = await request.json()
      if (typeof body?.status_note === 'string') statusNote = body.status_note.trim()
    } catch {
      // тело может отсутствовать — это нормально
    }

    const { data: task, error: tErr } = await sb
      .from('tasks')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()
    if (tErr) throw tErr
    if (!task) {
      return apiError('task_not_found', 404)
    }

    if (task.status !== 'unassigned') {
      return apiError('claim_only_pool_task', 409)
    }

    if (!isSuperadmin) {
      if (!task.department_id) {
        return apiError('task_department_not_specified', 400)
      }
      const myDepts = await getPersonDepartments(personId)
      if (!myDepts.includes(task.department_id)) {
        return apiError('claim_only_own_department', 403)
      }
    }

    // Атомарный UPDATE с условием по статусу (защита от race conditions)
    const { data: updated, error: uErr } = await sb
      .from('tasks')
      .update({
        assignee_type: 'person',
        assignee_id: personId,
        status: 'in_progress',
        claimed_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('status', 'unassigned')
      .select('*')
      .single()

    if (uErr) {
      if (uErr.code === 'PGRST116') {
        return apiError('task_already_claimed', 409)
      }
      const m = mapDbError(uErr)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    await sb.from('task_status_history').insert({
      task_id: params.id,
      actor_id: personId,
      from_status: 'unassigned',
      to_status: 'in_progress',
      note: statusNote || 'Задача взята из пула',
    })

    // Если указан комментарий — продублировать его в ленту task_comments,
    // чтобы он был виден в обсуждении, а не только в истории статусов.
    if (statusNote) {
      const { error: cErr } = await sb.from('task_comments').insert({
        task_id: params.id,
        author_id: personId,
        content: statusNote,
        comment_type: 'status_note',
      })
      if (cErr) console.error('[tasks claim] не удалось продублировать заметку в комментарии:', cErr)
    }

    return NextResponse.json(updated)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
