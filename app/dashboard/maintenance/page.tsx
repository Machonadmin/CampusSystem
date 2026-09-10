import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { hasMaintenancePrivilege } from '@/lib/maintenance/permissions'
import { diagnoseModuleAccess } from '@/lib/permissions/diagnose'
import NoModuleAccess from '@/components/dashboard/NoModuleAccess'
import MaintenanceListClient from './MaintenanceListClient'

/**
 * Список заявок на обслуживание. Просмотр — под maintenance.view. Кнопки
 * (новая заявка и т. п.) гейтятся флагом canManage, вычисленным на сервере.
 *
 * Без права view раньше был молчаливый redirect('/dashboard'): плитку модуля
 * показывает право maintenance.ACCESS, поэтому человек видел модуль, кликал и
 * его без объяснений возвращало на главную. Теперь вместо этого показывается
 * экран с причиной (какого права не хватает и где его выдать) — доступ при этом
 * не расширяется, внутрь попадают ровно те же люди.
 */
export default async function MaintenancePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasMaintenancePrivilege(session, 'view')
  if (!canView) {
    const diagnosis = await diagnoseModuleAccess(
      session,
      'maintenance',
      (s, code) => hasMaintenancePrivilege(s, code as 'view' | 'manage'),
    )
    return <NoModuleAccess module="maintenance" required="view" diagnosis={diagnosis} />
  }

  const canManage = await hasMaintenancePrivilege(session, 'manage')

  return <MaintenanceListClient canManage={canManage} />
}
