import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny, getEducationPrivilegeScope } from '@/lib/education/permissions'
import { errorResponse } from '@/lib/api/handler'

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

    // Правка/удаление лида в списке גיוס. Лиды живут без подразделения, а сервер
    // (PATCH/DELETE /api/education/leads/[id], restore) для таких требует
    // manage_leads со scope='all' — то же условие здесь, чтобы у «только
    // просмотра» в меню ··· не было «עריכה»/«מחיקה», которые всё равно упадут.
    const recruitmentManage = isSuper
      || (await getEducationPrivilegeScope(session, 'manage_leads')) === 'all'

    return NextResponse.json({
      recruitment: leads,
      recruitment_manage: recruitmentManage,
      admission: applicants,
      committee: applicants,
      study: students,
      is_super: isSuper,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
