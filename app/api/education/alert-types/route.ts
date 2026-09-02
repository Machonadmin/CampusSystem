import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny, requireEducationPrivilege } from '@/lib/education/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * Справочник типов оповещений (student_alert_types, spec §3.8/§4.4) — редактируемый,
 * не жёсткий enum. GET — список (любой education-просмотр). POST — создать тип
 * (manage_alerts). Deploy-safe: нет таблицы → пусто.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canDoEducationInAny(session, 'view_students'))) return apiError('forbidden', 403)

    const activeOnly = new URL(request.url).searchParams.get('active_only') !== 'false'
    const sb = createServerClient()
    let q = sb.from('student_alert_types').select('code, name_he, name_ru, name_en, default_sensitive, is_active, sort_order').order('sort_order')
    if (activeOnly) q = q.eq('is_active', true)
    const { data, error } = await q
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ types: [] })
      throw error
    }
    return NextResponse.json({ types: data ?? [] })
  } catch (err: unknown) {
    return jsonError(err)
  }
}

const createSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9_]+$/, 'code_slug').min(2).max(40),
  name_he: z.string().trim().max(120).nullish(),
  name_ru: z.string().trim().max(120).nullish(),
  name_en: z.string().trim().max(120).nullish(),
  default_sensitive: z.boolean().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, createSchema)
    await requireEducationPrivilege('manage_alerts')
    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from('student_alert_types') as any).insert({
      code: body.code,
      name_he: body.name_he ?? null,
      name_ru: body.name_ru ?? null,
      name_en: body.name_en ?? null,
      default_sensitive: body.default_sensitive ?? false,
      is_active: body.is_active ?? true,
      sort_order: body.sort_order ?? 0,
    })
    if (error) {
      if (error.code === '42P01') return apiError('feature_not_migrated', 503)
      if (error.code === '23505') return apiError('record_exists', 409)
      throw error
    }
    return NextResponse.json({ code: body.code }, { status: 201 })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
