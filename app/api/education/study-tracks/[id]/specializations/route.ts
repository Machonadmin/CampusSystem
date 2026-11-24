import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/i18n/api-errors'
import { requireTracksCatalogPrivilege } from '@/lib/education/permissions'
import { jsonError, parseBody } from '@/lib/api/handler'
import { isMissingTable } from '@/lib/supabase/errors'
import { createServerClient } from '@/lib/supabase/server'

/**
 * POST /api/education/study-tracks/[id]/specializations — новая מגמה внутри
 * маршрута (напр. «אוניברסיטה» → «כלכלה»). Право: manage_tracks.
 * Список מגמות приходит вместе с маршрутами в GET /api/education/study-tracks.
 */
const createSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9_]+$/, 'code_slug').min(2).max(40),
  name_he: z.string().trim().min(1).max(120),
  name_ru: z.string().trim().max(120).optional(),
  name_en: z.string().trim().max(120).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
})

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  try {
    const body = await parseBody(request, createSchema)
    await requireTracksCatalogPrivilege()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createServerClient() as any
    const { data, error } = await sb.from('study_track_specializations').insert({
      track_id: id,
      code: body.code,
      name_he: body.name_he,
      name_ru: body.name_ru ?? '',
      name_en: body.name_en ?? '',
      sort_order: body.sort_order ?? 0,
    }).select('id').single()
    if (error) {
      if (isMissingTable(error)) return apiError('feature_not_migrated', 503)
      if (error.code === '23505') return apiError('specialization_exists', 409)
      if (error.code === '23503') return apiError('record_not_found', 404)
      throw error
    }
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
