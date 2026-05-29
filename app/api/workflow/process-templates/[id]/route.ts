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

// GET /api/workflow/process-templates/[id] — полная структура шаблона
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth()
    const sb = createServerClient()

    const { data: template, error: tErr } = await sb
      .from('process_templates')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()
    if (tErr) throw tErr
    if (!template) return NextResponse.json({ error: 'Шаблон не найден' }, { status: 404 })

    const { data: stages, error: sErr } = await sb
      .from('stage_templates')
      .select('*')
      .eq('process_template_id', params.id)
      .order('sort_order')
    if (sErr) throw sErr

    const stageIds = (stages ?? []).map((s: { id: string }) => s.id)

    let task_templates: unknown[] = []
    let finals: unknown[] = []
    let transitions: unknown[] = []

    if (stageIds.length > 0) {
      const [tasksRes, finalsRes, transitionsRes] = await Promise.all([
        sb.from('stage_task_templates')
          .select('*')
          .in('stage_template_id', stageIds)
          .order('stage_template_id')
          .order('sort_order'),
        sb.from('stage_finals')
          .select('*')
          .in('stage_template_id', stageIds)
          .order('stage_template_id')
          .order('sort_order'),
        sb.from('stage_transitions')
          .select('*')
          .in('from_stage_template_id', stageIds)
          .order('from_stage_template_id', { nullsFirst: true })
          .order('sort_order'),
      ])
      if (tasksRes.error) throw tasksRes.error
      if (finalsRes.error) throw finalsRes.error
      if (transitionsRes.error) throw transitionsRes.error
      task_templates = tasksRes.data ?? []
      finals         = finalsRes.data ?? []
      transitions    = transitionsRes.data ?? []
    }

    return NextResponse.json({ template, stages: stages ?? [], task_templates, finals, transitions })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

// PATCH /api/workflow/process-templates/[id] — только name_ru, description, is_active (code не меняем)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()
    const body = await request.json() as {
      name_ru?: string
      description?: string | null
      is_active?: boolean
    }

    const patch: Record<string, unknown> = {}
    if (body.name_ru !== undefined) {
      if (!body.name_ru.trim())
        return NextResponse.json({ error: 'name_ru не может быть пустым' }, { status: 400 })
      patch.name_ru = body.name_ru.trim()
    }
    if (body.description !== undefined) patch.description = body.description?.trim() || null
    if (body.is_active !== undefined)   patch.is_active = body.is_active

    if (Object.keys(patch).length === 0)
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })

    const { data, error } = await sb
      .from('process_templates')
      .update(patch)
      .eq('id', params.id)
      .select('*')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Шаблон не найден' }, { status: 404 })

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

// DELETE /api/workflow/process-templates/[id] — мягкое (is_active = false)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()

    const { data, error } = await sb
      .from('process_templates')
      .update({ is_active: false })
      .eq('id', params.id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Шаблон не найден' }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
