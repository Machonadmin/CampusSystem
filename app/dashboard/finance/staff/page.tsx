import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canViewStaffComp } from '@/lib/finance/staff-comp'
import StaffCompIndexClient from './StaffCompIndexClient'

/**
 * Индекс расчётных листов сотрудников (שכר צוות). Просмотр — под finance.view
 * через canViewStaffComp. Список сотрудников и переходы тянет клиент.
 */
export default async function StaffCompIndexPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!(await canViewStaffComp(session))) redirect('/dashboard')

  return <StaffCompIndexClient />
}
