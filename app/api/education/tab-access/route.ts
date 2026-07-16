import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'

/**
 * GET /api/education/tab-access — какие вкладки модуля «Учёба» вправе видеть
 * текущий пользователь. До сих пор все 4 вкладки (набор / приём / комиссия /
 * учёба) показывались всем без проверки — «все видят всё». Теперь страница
 * скрывает вкладки, на которые нет привилегии. Проверка — та же, что на API:
 *   набор → view_leads, приём + комиссия → view_applicants, учёба → view_students.
 * superadmin видит всё.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })

    const isSuper = session.roles.includes('superadmin')
    const [leads, applicants, students] = isSuper
      ? [true, true, true]
      : await Promise.all([
          canDoEducationInAny(session, 'view_leads'),
          canDoEducationInAny(session, 'view_applicants'),
          canDoEducationInAny(session, 'view_students'),
        ])

    return NextResponse.json({
      recruitment: leads,
      admission: applicants,
      committee: applicants,
      study: students,
      is_super: isSuper,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
