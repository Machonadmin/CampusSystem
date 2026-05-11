import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { mapDbError } from '@/lib/tasks/helpers'
import { getTaskAccess } from '@/lib/tasks/access'
import type { TaskRow, TaskCommentType } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

/**
 * GET /api/tasks/[id]/comments — список комментариев задачи.
 * Доступ — у всех кто может видеть задачу (canView).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    const { data: task, error: tErr } = await sb
      .from('tasks')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()
    if (tErr) throw tErr
    if (!task) {
      return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 })
    }

    const access = await getTaskAccess(task as unknown as TaskRow, session.person_id, session.roles ?? [])
    if (!access.canView) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }

    const { data, error } = await sb
      .from('task_comments')
      .select('*, author:persons!task_comments_author_id_fkey(id, full_name)')
      .eq('task_id', params.id)
      .order('created_at', { ascending: true })

    if (error) throw error
    return NextResponse.json({ comments: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

/**
 * POST /api/tasks/[id]/comments — добавить комментарий.
 * Доступ — у всех кто может видеть задачу (canView).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    const body = await request.json() as {
      content?: string
      comment_type?: TaskCommentType
    }
    const content = body.content?.trim()
    if (!content) {
      return NextResponse.json({ error: 'Комментарий не может быть пустым' }, { status: 400 })
    }
    if (content.length > 5000) {
      return NextResponse.json({ error: 'Комментарий слишком длинный (макс. 5000)' }, { status: 400 })
    }

    const { data: task, error: tErr } = await sb
      .from('tasks')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()
    if (tErr) throw tErr
    if (!task) {
      return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 })
    }
    const access = await getTaskAccess(task as unknown as TaskRow, session.person_id, session.roles ?? [])
    if (!access.canView) {
      return NextResponse.json({ error: 'Нет доступа' }, { status: 403 })
    }

    const { data, error } = await sb
      .from('task_comments')
      .insert({
        task_id: params.id,
        author_id: session.person_id,
        content,
        comment_type: body.comment_type ?? 'comment',
      })
      .select('*, author:persons!task_comments_author_id_fkey(id, full_name)')
      .single()

    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
