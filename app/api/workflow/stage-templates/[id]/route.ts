import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  return session
}

async function requireSuperadmin() {
  const session = await getSession()
  if (!session?.roles.includes('superadmin'))
    throw Object.assign(new Error(serverT('access_denied')), { status: 403 })
  return session
}

// PATCH /api/workflow/stage-templates/[id] — все поля кроме code и process_template_id
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
      has_tasks?: boolean
      has_action_log?: boolean
      is_optional?: boolean
      is_addable?: boolean
      sort_order?: number
      required_role_code?: string | null
      requires_signature?: boolean
    }

    const patch: Record<string, unknown> = {}
    if (body.name_ru !== undefined) {
      if (!body.name_ru.trim())
        return apiError('name_ru_not_empty', 400)
      patch.name_ru = body.name_ru.trim()
    }
    if (body.description !== undefined)  patch.description  = body.description?.trim() || null
    if (body.has_tasks !== undefined)    patch.has_tasks    = body.has_tasks
    if (body.has_action_log !== undefined) patch.has_action_log = body.has_action_log
    if (body.is_optional !== undefined)  patch.is_optional  = body.is_optional
    if (body.is_addable !== undefined)   patch.is_addable   = body.is_addable
    if (body.sort_order !== undefined)   patch.sort_order   = body.sort_order
    // Кто подписывает/отвечает (role code, можно список через запятую) — '' → NULL.
    if (body.required_role_code !== undefined)
      patch.required_role_code = body.required_role_code?.trim() || null
    if (body.requires_signature !== undefined) patch.requires_signature = body.requires_signature

    if (Object.keys(patch).length === 0)
      return apiError('no_changes', 400)

    const { data, error } = await sb
      .from('stage_templates')
      .update(patch)
      .eq('id', params.id)
      .select('*')
      .maybeSingle()
    if (error) throw error
    if (!data) return apiError('substage_not_found', 404)

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

// DELETE /api/workflow/stage-templates/[id] — физическое, с проверкой на существующие экземпляры
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('stage_templates')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return apiError('substage_not_found', 404)

    const { data: instances, error: iErr } = await sb
      .from('stage_instances')
      .select('id')
      .eq('stage_template_id', params.id)
      .limit(1)
    if (iErr) throw iErr

    if (instances && instances.length > 0)
      return apiError('cannot_delete_substage_active', 400)

    const { error } = await sb.from('stage_templates').delete().eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
