import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import {
  requireEducationPrivilege,
  canManageEducationInAny,
  canDoEducationInAny,
} from '@/lib/education/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * Утверждение преподавателя на курс (teacher_course_approvals, spec §3.6 / §4.7-4.8).
 * Chana ПРЕДЛАГАЕТ (proposed) → Moshe РЕШАЕТ (approved/rejected/info_requested).
 *
 * GET  ?status=&course_group_id= — очередь/список (Chana видит статусы, Moshe —
 *   очередь на утверждение). POST — предложить преподавателя (Chana,
 *   manage_class_teachers в подразделении курса).
 * Deploy-safe: нет таблицы (42P01) → GET пусто.
 */

async function courseDept(sb: ReturnType<typeof createServerClient>, courseId: string): Promise<string | null> {
  const { data } = await sb.from('class_groups').select('department_id').eq('id', courseId).maybeSingle()
  return (data as { department_id: string | null } | null)?.department_id ?? null
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const allowed = (await canManageEducationInAny(session, 'manage_class_teachers'))
      || (await canDoEducationInAny(session, 'approve_kodesh_teacher'))
    if (!allowed) return apiError('forbidden', 403)

    const url = new URL(request.url)
    const status = url.searchParams.get('status')?.trim()
    const courseId = url.searchParams.get('course_group_id')?.trim()

    const sb = createServerClient()
    let rows: Array<Record<string, unknown>> = []
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (sb.from('teacher_course_approvals') as any)
        .select('id, course_group_id, teacher_id, proposed_by, status, decided_by, decided_at, note, created_at, teacher:persons!teacher_course_approvals_teacher_id_fkey(id, full_name, hebrew_name), course:class_groups!teacher_course_approvals_course_group_id_fkey(id, name, name_he)')
        .order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      if (courseId) q = q.eq('course_group_id', courseId)
      const { data, error } = await q
      if (error) throw error
      rows = (data ?? []) as Array<Record<string, unknown>>
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ approvals: [] })
      throw e
    }
    return NextResponse.json({ approvals: rows })
  } catch (err: unknown) {
    return jsonError(err)
  }
}

const proposeSchema = z.object({
  course_group_id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  note: z.string().trim().max(2000).nullish(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, proposeSchema)
    const sb = createServerClient()
    const dept = await courseDept(sb, body.course_group_id)
    if (!dept) return apiError('not_found', 404)
    // Предложить преподавателя = управление преподавателями курса (Chana имеет
    // manage_class_teachers по кодешу — reuse, spec §5.1).
    const session = await requireEducationPrivilege('manage_class_teachers', { department_id: dept })

    // Повторное предложение сбрасывает решение (снова 'proposed').
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from('teacher_course_approvals') as any)
      .upsert({
        course_group_id: body.course_group_id,
        teacher_id: body.teacher_id,
        proposed_by: session.person_id,
        status: 'proposed',
        note: body.note ?? null,
        decided_by: null,
        decided_at: null,
      }, { onConflict: 'course_group_id,teacher_id' })
      .select('id')
      .single()
    if (error) {
      if (error.code === '42P01') return apiError('feature_not_migrated', 503)
      if (error.code === '23503') return apiError('invalid_reference', 400)
      throw error
    }
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
