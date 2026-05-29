import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

async function requireSuperadmin() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error('Доступ запрещён'), { status: 403 })
  return session
}

// PATCH /api/workflow/stage-task-templates/[id] — все поля кроме code и stage_template_id
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()
    const body = await request.json() as {
      title?: string
      description?: string | null
      default_assignee_type?: string | null
      default_role_code?: string | null
      default_position_id?: string | null
      default_priority?: string
      default_due_days?: number | null
      sort_order?: number
    }

    const VALID_ASSIGNEE = ['role', 'department', 'position', 'creator', 'manual']
    const VALID_PRIORITY  = ['low', 'normal', 'high', 'urgent']

    if (body.default_assignee_type !== undefined && body.default_assignee_type !== null &&
        !VALID_ASSIGNEE.includes(body.default_assignee_type))
      return NextResponse.json({ error: 'Недопустимое значение default_assignee_type' }, { status: 400 })

    if (body.default_priority !== undefined && !VALID_PRIORITY.includes(body.default_priority))
      return NextResponse.json({ error: 'Недопустимое значение default_priority' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    if (body.title !== undefined) {
      if (!body.title.trim())
        return NextResponse.json({ error: 'title не может быть пустым' }, { status: 400 })
      patch.title = body.title.trim()
    }
    if (body.description !== undefined)          patch.description          = body.description?.trim() || null
    if (body.default_assignee_type !== undefined) patch.default_assignee_type = body.default_assignee_type
    if (body.default_role_code !== undefined)     patch.default_role_code     = body.default_role_code?.trim() || null
    if (body.default_position_id !== undefined)   patch.default_position_id   = body.default_position_id || null
    if (body.default_priority !== undefined)      patch.default_priority      = body.default_priority
    if (body.default_due_days !== undefined)      patch.default_due_days      = body.default_due_days
    if (body.sort_order !== undefined)            patch.sort_order            = body.sort_order

    if (Object.keys(patch).length === 0)
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })

    const { data, error } = await sb
      .from('stage_task_templates')
      .update(patch)
      .eq('id', params.id)
      .select('*')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Шаблон задачи не найден' }, { status: 404 })

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

// DELETE /api/workflow/stage-task-templates/[id] — физическое, без проверок
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('stage_task_templates')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return NextResponse.json({ error: 'Шаблон задачи не найден' }, { status: 404 })

    const { error } = await sb.from('stage_task_templates').delete().eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
