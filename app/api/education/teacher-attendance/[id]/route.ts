import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege, getEducationPrivilegeScope } from '@/lib/education/permissions'

/**
 * PATCH /api/education/teacher-attendance/[id]
 *   { decision: 'approved' | 'rejected' } — секретариат подтверждает/отклоняет
 *   отметку присутствия преподавателя. Доступ: manage_students / superadmin.
 * Деплой-безопасно (42P01 → 503).
 */

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal === 'student') return apiError('forbidden', 403)

    const id = (params.id ?? '').trim()
    if (!id) return apiError('invalid_reference', 400)

    const body = await request.json().catch(() => ({})) as { decision?: string }
    const decision = (body.decision ?? '').trim()
    if (decision !== 'approved' && decision !== 'rejected') return apiError('invalid_reference', 400)

    const sb = createServerClient()
    try {
      const { data: row } = await sb.from('teacher_attendance').select('id, status, lesson_id').eq('id', id).maybeSingle()
      if (!row) return apiError('substage_not_found', 404)

      // Подтверждать нокхут может ТОЛЬКО менеджер подразделения этого урока
      // (решение владельца: «רק המחלקה שלו»). Урок → группа → department_id.
      // Если у группы нет подразделения — действовать может лишь scope='all'
      // (иначе department-scope трактовался бы как «общий пул»).
      const lessonId = (row as { lesson_id: string }).lesson_id
      const { data: lesson } = await sb.from('lessons').select('class_group_id').eq('id', lessonId).maybeSingle()
      let deptId: string | null = null
      const cgId = (lesson as { class_group_id?: string } | null)?.class_group_id
      if (cgId) {
        const { data: cg } = await sb.from('class_groups').select('department_id').eq('id', cgId).maybeSingle()
        deptId = (cg as { department_id?: string | null } | null)?.department_id ?? null
      }
      const allowed = session.roles.includes('superadmin')
        || (deptId
          ? await hasEducationPrivilege(session, 'manage_students', { department_id: deptId })
          : (await getEducationPrivilegeScope(session, 'manage_students')) === 'all')
      if (!allowed) return apiError('forbidden', 403)

      const { error } = await sb.from('teacher_attendance')
        .update({ status: decision, decided_by: session.person_id, decided_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return NextResponse.json({ ok: true })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return apiError('feature_unavailable', 503)
      throw e
    }
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
