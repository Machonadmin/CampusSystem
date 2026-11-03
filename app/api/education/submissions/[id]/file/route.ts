import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import { getAssessmentAccess } from '@/lib/education/lesson-access'
import { getSignedUrl } from '@/lib/documents/storage'
import { isMissingTable } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'

export const runtime = 'nodejs'

/**
 * GET /api/education/submissions/[id]/file — свежая подписанная ссылка (5 мин)
 * на файл сданной מטלה.
 *
 * Право: ученица — только своя сдача (journey из сессии); сотрудник —
 * view_students в контексте учебной группы задания (или superadmin).
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()

    const { data: sub, error } = await sb
      .from('assessment_submissions')
      .select('id, assessment_id, journey_id, storage_path, file_name')
      .eq('id', params.id)
      .maybeSingle()
    if (error) {
      if (isMissingTable(error)) return apiError('not_found', 404)
      throw error
    }
    if (!sub) return apiError('not_found', 404)

    if (session.principal === 'student') {
      if (session.student_journey_id !== sub.journey_id) return apiError('forbidden', 403)
    } else if (!session.roles.includes('superadmin')) {
      const access = await getAssessmentAccess(sb, sub.assessment_id)
      if (!access) return apiError('not_found', 404)
      if (!(await hasEducationPrivilege(session, 'view_students', access.target))) return apiError('forbidden', 403)
    }

    const url = await getSignedUrl(sub.storage_path)
    return NextResponse.json({ url, file_name: sub.file_name })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
