import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getTaskAccess } from '@/lib/tasks/access'
import type { TaskRow } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

/**
 * DELETE /api/tasks/[id]/watchers/[personId] — снять наблюдателя.
 * Может: сам наблюдатель (отписаться), автор задачи, суперадмин.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; personId: string } }
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

    const isSelf = params.personId === session.person_id
    if (!isSelf && !access.canEdit) {
      return NextResponse.json(
        { error: 'Снять наблюдателя может он сам, автор задачи или суперадмин' },
        { status: 403 }
      )
    }

    const { error: dErr } = await sb
      .from('task_watchers')
      .delete()
      .eq('task_id', params.id)
      .eq('person_id', params.personId)
    if (dErr) throw dErr

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
