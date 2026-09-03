import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageEducationInAny, requireEducationPrivilege } from '@/lib/education/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * Справочник ТИПОВ дней календаря (calendar_day_types, spec §3.4 расширение) —
 * редактируемый, не жёсткий enum. Каждый тип говорит, что он блокирует:
 * blocks_secular / blocks_kodesh / is_shortened. Право: manage_class_groups
 * (то же, что управление кодеш/расписанием). Deploy-safe: нет таблицы → пусто.
 *
 * GET  — список типов (active_only=false → включая деактивированные).
 * POST — создать тип.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageEducationInAny(session, 'manage_class_groups'))) return apiError('forbidden', 403)

    const activeOnly = new URL(request.url).searchParams.get('active_only') !== 'false'
    const sb = createServerClient()
    let q = sb
      .from('calendar_day_types')
      .select('code, name_he, name_ru, name_en, blocks_secular, blocks_kodesh, is_shortened, is_active, sort_order')
      .order('sort_order')
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
  blocks_secular: z.boolean().optional(),
  blocks_kodesh: z.boolean().optional(),
  is_shortened: z.boolean().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, createSchema)
    await requireEducationPrivilege('manage_class_groups')
    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from('calendar_day_types') as any).insert({
      code: body.code,
      name_he: body.name_he ?? null,
      name_ru: body.name_ru ?? null,
      name_en: body.name_en ?? null,
      blocks_secular: body.blocks_secular ?? false,
      blocks_kodesh: body.blocks_kodesh ?? false,
      is_shortened: body.is_shortened ?? false,
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
