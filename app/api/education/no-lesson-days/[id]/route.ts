import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * PATCH  /api/education/no-lesson-days/[id] — правка типа дня / причины на месте.
 * DELETE /api/education/no-lesson-days/[id] — убрать день без уроков. Право:
 * manage_class_groups в scope дня ('all' → нужен scope='all'; иначе — в
 * подразделении дня).
 */

const patchSchema = z.object({
  day_type_code: z.string().trim().max(40).optional(),
  reason: z.string().trim().max(200).nullish(),
})

async function gateByRowScope(sb: ReturnType<typeof createServerClient>, id: string): Promise<boolean> {
  const { data: row, error: rErr } = await sb
    .from('academic_no_lesson_days').select('scope').eq('id', id).maybeSingle()
  if (rErr) {
    if (rErr.code === '42P01') return false
    throw rErr
  }
  if (!row) return false
  const scope = (row as { scope: string }).scope
  if (scope === 'all') await requireEducationPrivilege('manage_class_groups')
  else await requireEducationPrivilege('manage_class_groups', { department_id: scope })
  return true
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseBody(request, patchSchema)
    const sb = createServerClient()
    if (!(await gateByRowScope(sb, params.id))) return apiError('record_not_found', 404)

    const patch: Record<string, unknown> = {}
    if (body.day_type_code !== undefined) patch.day_type_code = body.day_type_code
    if (body.reason !== undefined) patch.reason = body.reason ?? null
    if (Object.keys(patch).length === 0) return apiError('no_fields_to_update', 400)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { error } = await (sb.from('academic_no_lesson_days') as any).update(patch).eq('id', params.id)
    // Колонка day_type_code ещё не мигрирована → повторяем без неё.
    if (error && error.code === '42703') {
      const { day_type_code: _omit, ...legacy } = patch
      if (Object.keys(legacy).length === 0) return apiError('feature_not_migrated', 503)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const retry = await (sb.from('academic_no_lesson_days') as any).update(legacy).eq('id', params.id)
      error = retry.error
    }
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sb = createServerClient()
    if (!(await gateByRowScope(sb, params.id))) return apiError('record_not_found', 404)
    const { error } = await sb.from('academic_no_lesson_days').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
