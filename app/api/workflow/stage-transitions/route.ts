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

// POST /api/workflow/stage-transitions
export async function POST(request: NextRequest) {
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

    if (!body.to_stage_template_id)
      return apiError('to_stage_template_id_required', 400)

    const VALID_MODES = ['after_one', 'after_all']
    if (body.activation_mode && !VALID_MODES.includes(body.activation_mode))
      return apiError('activation_mode_enum', 400)

    const { data, error } = await sb
      .from('stage_transitions')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        from_stage_template_id: body.from_stage_template_id ?? null,
        to_stage_template_id:   body.to_stage_template_id,
        trigger_final_code:     body.trigger_final_code ?? null,
        activation_mode:        body.activation_mode ?? 'after_one',
        sort_order:             body.sort_order ?? 0,
      } as any)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
