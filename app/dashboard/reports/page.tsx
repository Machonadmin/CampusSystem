import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { diagnoseModuleAccess, type ModulePrivilegeCheck } from '@/lib/permissions/diagnose'
import NoModuleAccess from '@/components/dashboard/NoModuleAccess'
import { hasReportsPrivilege } from '@/lib/reports/permissions'
import ReportsClient from './ReportsClient'

/**
 * Отчёты / Обзор — READ-ONLY дашборд руководства. Тонкий серверный гейт:
 * проверяет сессию и право reports.view, всё отображение (заголовок, карточки,
 * i18n, цвета) делегируется клиентскому компоненту (как в других модулях —
 * i18n в этом проекте client-only).
 */
export default async function ReportsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasReportsPrivilege(session, 'view')
  if (!canView) {
    // Не редирект: молчаливый возврат на главную неотличим от поломки.
    // Экран называет недостающее право и место, где его выдать.
    const diagnosis = await diagnoseModuleAccess(
      session, 'reports', hasReportsPrivilege as unknown as ModulePrivilegeCheck,
    )
    return <NoModuleAccess module="reports" required="view" diagnosis={diagnosis} />
  }

  return <ReportsClient />
}
