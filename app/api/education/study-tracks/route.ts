import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import {
  getEducationStructureDeptFilter,
  canDoEducationInAny,
  requireEducationPrivilege,
} from '@/lib/education/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'

/**
 * GET /api/education/study-tracks — справочник маршрутов (מסלולי לימוד).
 * Право: любое просмотровое/управляющее education-право (иначе 403).
 * Видимость по подразделению: структурный фильтр (getEducationStructureDeptFilter).
 * ?includeInactive=1 — вернуть и неактивные (для экрана управления); требует
 *   manage_tracks (институтский уровень) и снимает фильтр по подразделению.
 *
 * POST /api/education/study-tracks — создать маршрут. Право: manage_tracks
 *   (институтский уровень; НЕ кодеш/Хана — spec §3.2).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })

    const includeInactive = new URL(request.url).searchParams.get('includeInactive') === '1'
    const sb = createServerClient()
    const cols = 'id, code, name_he, name_ru, name_en, department_id, category, years_count, sort_order, is_active'

    // Экран управления каталогом: полный список (incl. inactive) только для
    // manage_tracks, без фильтра по подразделению (маршруты — институтские).
    if (includeInactive) {
      await requireEducationPrivilege('manage_tracks')
      const build = (select: string) =>
        sb.from('study_tracks').select(select).order('sort_order', { ascending: true })
      const { data, error } = await build(cols)
      if (error) {
        if (error.code === '42P01') return NextResponse.json({ tracks: [] })
        if (error.code === '42703') {
          const fb = await build('id, code, name_he, name_ru, name_en, department_id, sort_order, is_active')
          if (fb.error) throw fb.error
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return NextResponse.json({ tracks: ((fb.data ?? []) as any[]).map(tr => ({ ...tr, years_count: 4, category: null })) })
        }
        throw error
      }
      return NextResponse.json({ tracks: data ?? [] })
    }

    const allowed =
      (await canDoEducationInAny(session, 'view_students')) ||
      (await canDoEducationInAny(session, 'manage_class_groups')) ||
      (await canDoEducationInAny(session, 'manage_subjects'))
    if (!allowed) return NextResponse.json({ error: serverT('forbidden') }, { status: 403 })

    const myDepts = await getEducationStructureDeptFilter(session)
    if (myDepts && myDepts.length === 0) return NextResponse.json({ tracks: [] })

    const build = (select: string) => {
      let q = sb.from('study_tracks').select(select).eq('is_active', true)
      if (myDepts) q = q.in('department_id', myDepts)
      return q.order('sort_order', { ascending: true })
    }

    const { data, error } = await build(cols)
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ tracks: [] })
      // Колонки years_count/category ещё не мигрированы — отдаём без них.
      if (error.code === '42703') {
        const fb = await build('id, code, name_he, name_ru, name_en, department_id, sort_order')
        if (fb.error) throw fb.error
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return NextResponse.json({ tracks: ((fb.data ?? []) as any[]).map(tr => ({ ...tr, years_count: 4, category: null })) })
      }
      throw error
    }
    return NextResponse.json({ tracks: data ?? [] })
  } catch (err: unknown) {
    return jsonError(err)
  }
}

const createSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9_]+$/, 'code_slug').min(2).max(40),
  name_he: z.string().trim().min(1).max(120),
  name_ru: z.string().trim().min(1).max(120),
  name_en: z.string().trim().min(1).max(120),
  category: z.string().trim().max(40).nullish(),
  years_count: z.number().int().min(1).max(8).optional(),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
  department_id: z.string().uuid().nullish(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, createSchema)
    await requireEducationPrivilege('manage_tracks')
    const sb = createServerClient()

    const { data, error } = await sb
      .from('study_tracks')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({
        code: body.code,
        name_he: body.name_he,
        name_ru: body.name_ru,
        name_en: body.name_en,
        category: body.category ?? null,
        years_count: body.years_count ?? 4,
        sort_order: body.sort_order ?? 0,
        is_active: body.is_active ?? true,
        department_id: body.department_id ?? null,
      } as any)
      .select('id')
      .single()
    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
