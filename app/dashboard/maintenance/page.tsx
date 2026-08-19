import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { hasMaintenancePrivilege } from '@/lib/maintenance/permissions'
import MaintenanceListClient from './MaintenanceListClient'

/**
 * Список заявок на обслуживание. Просмотр — под maintenance.view. Кнопки
 * (новая заявка и т. п.) гейтятся флагом canManage, вычисленным на сервере.
 */
export default async function MaintenancePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasMaintenancePrivilege(session, 'view')
  if (!canView) redirect('/dashboard')

  const canManage = await hasMaintenancePrivilege(session, 'manage')

  return <MaintenanceListClient canManage={canManage} />
}
