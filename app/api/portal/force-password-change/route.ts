import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession, reissueSession } from '@/lib/auth/session'
import { revokeSessionsBefore } from '@/lib/auth/live-session'
import { hashPassword, passwordStrengthIssue } from '@/lib/auth/password'
import { errorResponse } from '@/lib/api/handler'

/**
 * POST /api/portal/force-password-change  { new_password }  (СТУДЕНТКА)
 * Первая обязательная смена временного пароля портала. Разрешена только при
 * must_change_password=true у её student_credentials. Ставит хеш, снимает флаг.
 */

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.principal !== 'student' || !session.student_journey_id) return apiError('forbidden', 403)

    const { new_password } = await request.json().catch(() => ({})) as { new_password?: string }
    const issue = passwordStrengthIssue(new_password ?? '')
    if (issue) return apiError(issue === 'too_short' ? 'new_password_min_8' : 'password_need_letter_and_digit', 400)

    const sb = createServerClient()
    const { data: cred } = await sb.from('student_credentials')
      .select('id, must_change_password').eq('journey_id', session.student_journey_id).maybeSingle()
    if (!cred) return apiError('account_not_found', 404)
    if (!(cred as { must_change_password?: boolean }).must_change_password) return apiError('forbidden', 403)

    const password_hash = await hashPassword(new_password!)
    const { error } = await sb.from('student_credentials')
      .update({ password_hash, must_change_password: false }).eq('id', (cred as { id: string }).id)
    if (error) throw error
    // Временный пароль мог видеть кто-то ещё: выходим везде, кроме этого браузера.
    await revokeSessionsBefore('student_credentials', 'id', (cred as { id: string }).id)
    await reissueSession(session)
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { message?: string }
    return errorResponse({ message: e.message, status: 500 })
  }
}
