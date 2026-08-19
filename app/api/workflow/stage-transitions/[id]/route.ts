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

// PATCH /api/workflow/stage-transitions/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()
    const body = await request.json() as {
      from_stage_template_id?: string | null
      to_stage_template_id?: string
      trigger_final_code?: string | null
      activation_mode?: string
      sort_order?: number
    }

    const VALID_MODES = ['after_one', 'after_all']
    if (body.activation_mode !== undefined && !VALID_MODES.includes(body.activation_mode))
      return apiError('activation_mode_enum', 400)

    const patch: Record<string, unknown> = {}
    if ('from_stage_template_id' in body) patch.from_stage_template_id = body.from_stage_template_id ?? null
    if (body.to_stage_template_id !== undefined) {
      if (!body.to_stage_template_id)
        return apiError('to_stage_template_id_not_empty', 400)
      patch.to_stage_template_id = body.to_stage_template_id
    }
    if ('trigger_final_code' in body) patch.trigger_final_code = body.trigger_final_code ?? null
    if (body.activation_mode !== undefined) patch.activation_mode = body.activation_mode
    if (body.sort_order !== undefined)      patch.sort_order      = body.sort_order

    if (Object.keys(patch).length === 0)
      return apiError('no_changes', 400)

    const { data, error } = await sb
      .from('stage_transitions')
      .update(patch)
      .eq('id', params.id)
      .select('*')
      .maybeSingle()
    if (error) throw error
    if (!data) return apiError('transition_not_found', 404)

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

// DELETE /api/workflow/stage-transitions/[id] — физическое, без проверок
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('stage_transitions')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return apiError('transition_not_found', 404)

    const { error } = await sb.from('stage_transitions').delete().eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
