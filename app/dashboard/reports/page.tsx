import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
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
  if (!canView) redirect('/dashboard')

  return <ReportsClient />
}
