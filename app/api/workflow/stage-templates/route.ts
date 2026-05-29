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

// GET /api/workflow/stage-templates — POST only, no list endpoint (structure via process-templates/[id])
// POST /api/workflow/stage-templates
export async function POST(request: NextRequest) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()
    const body = await request.json() as {
      process_template_id?: string
      code?: string
      name_ru?: string
      description?: string
      has_tasks?: boolean
      has_action_log?: boolean
      is_optional?: boolean
      is_addable?: boolean
      sort_order?: number
    }

    if (!body.process_template_id)
      return NextResponse.json({ error: 'process_template_id обязателен' }, { status: 400 })
    if (!body.code?.trim())
      return NextResponse.json({ error: 'code обязателен' }, { status: 400 })
    if (!body.name_ru?.trim())
      return NextResponse.json({ error: 'name_ru обязателен' }, { status: 400 })

    const { data: parent, error: pErr } = await sb
      .from('process_templates')
      .select('id')
      .eq('id', body.process_template_id)
      .maybeSingle()
    if (pErr) throw pErr
    if (!parent) return NextResponse.json({ error: 'Шаблон процесса не найден' }, { status: 404 })

    const { data, error } = await sb
      .from('stage_templates')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        process_template_id: body.process_template_id,
        code:                body.code.trim(),
        name_ru:             body.name_ru.trim(),
        description:         body.description?.trim() || null,
        has_tasks:           body.has_tasks      ?? false,
        has_action_log:      body.has_action_log ?? true,
        is_optional:         body.is_optional    ?? false,
        is_addable:          body.is_addable     ?? false,
        sort_order:          body.sort_order     ?? 0,
      } as any)
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505')
        return NextResponse.json({ error: 'Подэтап с таким кодом уже существует в этом шаблоне' }, { status: 409 })
      throw error
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
