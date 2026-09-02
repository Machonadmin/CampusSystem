import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * PATCH /api/education/teacher-approvals/[id] — решение Moshe по предложенному
 * преподавателю (spec §4.8). status ∈ approved|rejected|info_requested. При
 * 'approved' преподаватель добавляется в class_teachers курса (идемпотентно).
 * Право: approve_kodesh_teacher (Moshe).
 */

const decideSchema = z.object({
  status: z.enum(['approved', 'rejected', 'info_requested']),
  note: z.string().trim().max(2000).nullish(),
})

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseBody(request, decideSchema)
    const session = await requireEducationPrivilege('approve_kodesh_teacher', { department_id: KODESH_DEPT_ID })
    const sb = createServerClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error: rErr } = await (sb.from('teacher_course_approvals') as any)
      .select('id, course_group_id, teacher_id')
      .eq('id', params.id)
      .maybeSingle()
    if (rErr) {
      if (rErr.code === '42P01') return apiError('feature_not_migrated', 503)
      throw rErr
    }
    if (!row) return apiError('record_not_found', 404)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: uErr } = await (sb.from('teacher_course_approvals') as any)
      .update({ status: body.status, note: body.note ?? null, decided_by: session.person_id, decided_at: new Date().toISOString() })
      .eq('id', params.id)
    if (uErr) throw uErr

    // Утверждён → фактически ставим преподавателя на курс (идемпотентно).
    if (body.status === 'approved') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: ctErr } = await (sb.from('class_teachers') as any)
        .upsert({ class_group_id: row.course_group_id, teacher_id: row.teacher_id, added_by: session.person_id },
          { onConflict: 'class_group_id,teacher_id', ignoreDuplicates: true })
      if (ctErr && ctErr.code !== '23505') throw ctErr
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
