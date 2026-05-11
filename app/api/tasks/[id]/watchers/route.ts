import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { mapDbError } from '@/lib/tasks/helpers'
import { getTaskAccess } from '@/lib/tasks/access'
import type { TaskRow } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

/**
 * GET /api/tasks/[id]/watchers — список наблюдателей.
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
      .from('task_watchers')
      .select('*, person:persons!task_watchers_person_id_fkey(id, full_name)')
      .eq('task_id', params.id)
      .order('added_at', { ascending: true })

    if (error) throw error
    return NextResponse.json({ watchers: data ?? [] })
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
 * POST /api/tasks/[id]/watchers — добавить наблюдателя.
 * Body: { person_id: string } или { person_ids: string[] } (батч)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    const body = await request.json() as { person_id?: string; person_ids?: string[] }
    const personIds = body.person_ids ?? (body.person_id ? [body.person_id] : [])
    if (personIds.length === 0) {
      return NextResponse.json({ error: 'Не указан наблюдатель' }, { status: 400 })
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

    const rows = personIds.map(person_id => ({
      task_id: params.id,
      person_id,
      added_by: session.person_id,
    }))

    // upsert по composite PK — если уже наблюдатель, игнорируем
    const { data, error } = await sb
      .from('task_watchers')
      .upsert(rows, { onConflict: 'task_id,person_id', ignoreDuplicates: true })
      .select('*, person:persons!task_watchers_person_id_fkey(id, full_name)')

    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json({ watchers: data ?? [] }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
