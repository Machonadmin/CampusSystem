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

// POST /api/workflow/stage-task-templates
export async function POST(request: NextRequest) {
  try {
    await requireSuperadmin()
    const sb = createServerClient()
    const body = await request.json() as {
      stage_template_id?: string
      code?: string
      title?: string
      description?: string
      default_assignee_type?: string
      default_role_code?: string
      default_position_id?: string
      default_department_id?: string
      default_priority?: string
      default_due_days?: number
      sort_order?: number
    }

    if (!body.stage_template_id)
      return apiError('stage_template_id_required', 400)
    if (!body.code?.trim())
      return apiError('code_field_required', 400)
    if (!body.title?.trim())
      return apiError('title_field_required', 400)

    const { data: parent, error: pErr } = await sb
      .from('stage_templates')
      .select('id')
      .eq('id', body.stage_template_id)
      .maybeSingle()
    if (pErr) throw pErr
    if (!parent) return apiError('substage_not_found', 404)

    const VALID_ASSIGNEE = ['role', 'department', 'position', 'creator', 'manual']
    const VALID_PRIORITY  = ['low', 'normal', 'high', 'urgent']

    if (body.default_assignee_type && !VALID_ASSIGNEE.includes(body.default_assignee_type))
      return apiError('invalid_default_assignee_type', 400)
    if (body.default_priority && !VALID_PRIORITY.includes(body.default_priority))
      return apiError('invalid_default_priority', 400)

    const { data, error } = await sb
      .from('stage_task_templates')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        stage_template_id:     body.stage_template_id,
        code:                  body.code.trim(),
        title:                 body.title.trim(),
        description:           body.description?.trim() || null,
        default_assignee_type: body.default_assignee_type || null,
        default_role_code:     body.default_role_code?.trim() || null,
        default_position_id:   body.default_position_id || null,
        default_department_id: body.default_department_id || null,
        default_priority:      body.default_priority ?? 'normal',
        default_due_days:      body.default_due_days ?? null,
        sort_order:            body.sort_order ?? 0,
      } as any)
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505')
        return apiError('task_code_exists_substage', 409)
      throw error
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
