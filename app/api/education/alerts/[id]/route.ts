import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege, hasEducationPrivilege } from '@/lib/education/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * PATCH /api/education/alerts/[id] — изменить состояние оповещения (и, при
 * закрытии/в работе, handled_by/at). Право: manage_alerts. Чувствительное
 * оповещение можно менять только с view_sensitive_alerts.
 */
const patchSchema = z.object({
  state: z.enum(['new', 'in_progress', 'waiting', 'closed']).optional(),
  title: z.string().trim().max(300).nullish(),
  body: z.string().trim().max(5000).nullish(),
})

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseBody(request, patchSchema)
    const session = await requireEducationPrivilege('manage_alerts')
    const sb = createServerClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error: rErr } = await (sb.from('student_alerts') as any)
      .select('id, is_sensitive').eq('id', params.id).maybeSingle()
    if (rErr) {
      if (rErr.code === '42P01') return apiError('feature_not_migrated', 503)
      throw rErr
    }
    if (!row) return apiError('record_not_found', 404)
    if (row.is_sensitive && !(await hasEducationPrivilege(session, 'view_sensitive_alerts'))) {
      return apiError('forbidden', 403)
    }

    const patch: Record<string, unknown> = {}
    if (body.title !== undefined) patch.title = body.title ?? null
    if (body.body !== undefined) patch.body = body.body ?? null
    if (body.state !== undefined) {
      patch.state = body.state
      if (body.state === 'closed' || body.state === 'in_progress') {
        patch.handled_by = session.person_id
        patch.handled_at = new Date().toISOString()
      }
    }
    if (Object.keys(patch).length === 0) return apiError('no_fields_to_update', 400)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from('student_alerts') as any).update(patch).eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
