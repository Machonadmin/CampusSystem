import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import {
  canManageEducationInAny,
  requireEducationPrivilege,
} from '@/lib/education/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * Дни без уроков (ימים ללא לימודים, spec §3.4 / §4.5).
 *
 * GET  /api/education/no-lesson-days?year=<year_label> — список дней.
 *   Право: любое управляющее education-право (manage_class_groups).
 * POST /api/education/no-lesson-days — добавить день. scope='all' → нужен
 *   manage_class_groups со scope='all' (институтский выходной); scope=<dept> →
 *   manage_class_groups в этом подразделении (напр. кодеш). Не мандаторно —
 *   владелец сам добавляет/убирает.
 *
 * Deploy-safe: нет таблицы (42P01) → GET пусто.
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageEducationInAny(session, 'manage_class_groups'))) return apiError('forbidden', 403)

    const year = new URL(request.url).searchParams.get('year')?.trim()
    const sb = createServerClient()
    let q = sb.from('academic_no_lesson_days').select('id, year_label, date, reason, scope').order('date', { ascending: true })
    if (year) q = q.eq('year_label', year)
    const { data, error } = await q
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ days: [] })
      throw error
    }
    return NextResponse.json({ days: data ?? [] })
  } catch (err: unknown) {
    return jsonError(err)
  }
}

const createSchema = z.object({
  year_label: z.string().trim().min(1).max(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date_ymd'),
  reason: z.string().trim().max(200).nullish(),
  // 'all' или department_id (uuid).
  scope: z.string().trim().min(1).max(64).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, createSchema)
    const scope = body.scope && body.scope !== 'all' ? body.scope : 'all'
    // scope='all' → институтский выходной (нужен manage_class_groups all);
    // scope=<dept> → право в этом подразделении.
    const session = scope === 'all'
      ? await requireEducationPrivilege('manage_class_groups')
      : await requireEducationPrivilege('manage_class_groups', { department_id: scope })

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from('academic_no_lesson_days') as any)
      .upsert({
        year_label: body.year_label,
        date: body.date,
        reason: body.reason ?? null,
        scope,
        created_by: session.person_id,
      }, { onConflict: 'year_label,date,scope', ignoreDuplicates: false })
      .select('id')
      .single()
    if (error) throw error
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
