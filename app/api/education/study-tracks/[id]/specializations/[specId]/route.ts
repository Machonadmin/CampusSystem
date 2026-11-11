import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/i18n/api-errors'
import { requireTracksCatalogPrivilege } from '@/lib/education/permissions'
import { jsonError, parseBody } from '@/lib/api/handler'
import { isMissingTable } from '@/lib/supabase/errors'
import { createServerClient } from '@/lib/supabase/server'

/**
 * PUT /api/education/study-tracks/[id]/specializations/[specId] — переименовать
 * или (де)активировать מגמה. Удаления нет: מגמה может быть у студенток,
 * מקצועות и קבוצות — её отключают. Право: manage_tracks.
 */
const updateSchema = z.object({
  name_he: z.string().trim().min(1).max(120).optional(),
  name_ru: z.string().trim().max(120).optional(),
  name_en: z.string().trim().max(120).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
})

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string; specId: string }> }) {
  const { id, specId } = await props.params
  try {
    const body = await parseBody(request, updateSchema)
    await requireTracksCatalogPrivilege()
    const patch: Record<string, unknown> = {}
    for (const k of ['name_he', 'name_ru', 'name_en', 'sort_order', 'is_active'] as const) {
      if (body[k] !== undefined) patch[k] = body[k]
    }
    if (Object.keys(patch).length === 0) return apiError('no_fields_to_update', 400)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServerClient() as any
    const { data, error } = await sb.from('study_track_specializations')
      .update(patch).eq('id', specId).eq('track_id', id).select('id').maybeSingle()
    if (error) {
      if (isMissingTable(error)) return apiError('feature_not_migrated', 503)
      throw error
    }
    if (!data) return apiError('record_not_found', 404)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
