import { NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'

/**
 * GET /api/education/attendance-capability
 * Может ли текущий пользователь где-либо отмечать посещаемость (mark_attendance)
 * — чтобы календарь решал, показывать ли действие «נוכחות» на уроке. Реальную
 * проверку по группе урока делает POST .../attendance (это только для UI).
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const canMark = await canDoEducationInAny(session, 'mark_attendance')
    return NextResponse.json({ can_mark: canMark })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
