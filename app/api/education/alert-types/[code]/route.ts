import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * PUT/DELETE /api/education/alert-types/[code] — правка/удаление типа оповещения.
 * Право: manage_alerts. Удаление, на которое ссылаются оповещения (FK), лучше
 * заменять деактивацией (is_active=false).
 */

const updateSchema = z.object({
  name_he: z.string().trim().max(120).nullish(),
  name_ru: z.string().trim().max(120).nullish(),
  name_en: z.string().trim().max(120).nullish(),
  default_sensitive: z.boolean().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
})

export async function PUT(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const body = await parseBody(request, updateSchema)
    await requireEducationPrivilege('manage_alerts')
    const sb = createServerClient()
    const patch: Record<string, unknown> = {}
    for (const k of ['default_sensitive', 'is_active', 'sort_order'] as const) if (body[k] !== undefined) patch[k] = body[k]
    for (const k of ['name_he', 'name_ru', 'name_en'] as const) if (body[k] !== undefined) patch[k] = body[k] ?? null
    if (Object.keys(patch).length === 0) return apiError('no_fields_to_update', 400)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from('student_alert_types') as any).update(patch).eq('code', params.code).select('code').maybeSingle()
    if (error) throw error
    if (!data) return apiError('record_not_found', 404)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { code: string } }) {
  try {
    await requireEducationPrivilege('manage_alerts')
    const sb = createServerClient()
    const { error } = await sb.from('student_alert_types').delete().eq('code', params.code)
    if (error) {
      if (error.code === '23503') return apiError('record_in_use', 409)
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
