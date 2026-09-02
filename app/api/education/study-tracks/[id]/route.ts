import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * PUT    /api/education/study-tracks/[id] — обновить маршрут. Право: manage_tracks.
 * DELETE /api/education/study-tracks/[id] — удалить маршрут. Если на маршруте есть
 *   назначения (FK RESTRICT → 23503), удаление запрещено (409, track_in_use) —
 *   вместо этого деактивируйте маршрут (PUT is_active=false). Право: manage_tracks.
 */

const updateSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9_]+$/, 'code_slug').min(2).max(40).optional(),
  name_he: z.string().trim().min(1).max(120).optional(),
  name_ru: z.string().trim().min(1).max(120).optional(),
  name_en: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().max(40).nullish(),
  years_count: z.number().int().min(1).max(8).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
  department_id: z.string().uuid().nullish(),
})

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseBody(request, updateSchema)
    await requireEducationPrivilege('manage_tracks')
    const sb = createServerClient()

    const patch: Record<string, unknown> = {}
    for (const k of ['code', 'name_he', 'name_ru', 'name_en', 'years_count', 'sort_order', 'is_active'] as const) {
      if (body[k] !== undefined) patch[k] = body[k]
    }
    // category / department_id могут явно обнуляться (null).
    if (body.category !== undefined) patch.category = body.category ?? null
    if (body.department_id !== undefined) patch.department_id = body.department_id ?? null
    if (Object.keys(patch).length === 0) return apiError('no_fields_to_update', 400)

    const { data, error } = await sb
      .from('study_tracks')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq('id', params.id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data) return apiError('record_not_found', 404)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireEducationPrivilege('manage_tracks')
    const sb = createServerClient()
    const { error } = await sb.from('study_tracks').delete().eq('id', params.id)
    if (error) {
      // FK RESTRICT: маршрут используется студентками — деактивируйте вместо удаления.
      if (error.code === '23503') return apiError('track_in_use', 409)
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
