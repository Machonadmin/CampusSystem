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

// PATCH /api/workflow/stage-finals/[id] — name_ru, is_positive, sort_order (code не меняем)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()
    const body = await request.json() as {
      name_ru?: string
      is_positive?: boolean
      sort_order?: number
    }

    const patch: Record<string, unknown> = {}
    if (body.name_ru !== undefined) {
      if (!body.name_ru.trim())
        return apiError('name_ru_not_empty', 400)
      patch.name_ru = body.name_ru.trim()
    }
    if (body.is_positive !== undefined) patch.is_positive = body.is_positive
    if (body.sort_order !== undefined)  patch.sort_order  = body.sort_order

    if (Object.keys(patch).length === 0)
      return apiError('no_changes', 400)

    const { data, error } = await sb
      .from('stage_finals')
      .update(patch)
      .eq('id', params.id)
      .select('*')
      .maybeSingle()
    if (error) throw error
    if (!data) return apiError('final_not_found', 404)

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

// DELETE /api/workflow/stage-finals/[id] — физическое, с проверкой stage_instances.final_code
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()

    const { data: final, error: fetchErr } = await sb
      .from('stage_finals')
      .select('id, code, stage_template_id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!final) return apiError('final_not_found', 404)

    // Проверяем, не использован ли этот финал в stage_instances
    const { data: usedInstances, error: iErr } = await sb
      .from('stage_instances')
      .select('id')
      .eq('stage_template_id', final.stage_template_id)
      .eq('final_code', final.code)
      .limit(1)
    if (iErr) throw iErr

    if (usedInstances && usedInstances.length > 0)
      return apiError('cannot_delete_final_used', 400)

    const { error } = await sb.from('stage_finals').delete().eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
