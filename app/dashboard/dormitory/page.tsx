import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { diagnoseModuleAccess, type ModulePrivilegeCheck } from '@/lib/permissions/diagnose'
import NoModuleAccess from '@/components/dashboard/NoModuleAccess'
import { hasDormitoryPrivilege } from '@/lib/dormitory/permissions'
import DormBuildingsClient from './DormBuildingsClient'

/**
 * Список зданий общежития. Просмотр — под dormitory.view. Кнопки правки
 * (добавить здание и т. п.) гейтятся флагом canManage, вычисленным на сервере.
 */
export default async function DormitoryPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasDormitoryPrivilege(session, 'view')
  if (!canView) {
    // Не редирект: молчаливый возврат на главную неотличим от поломки.
    // Экран называет недостающее право и место, где его выдать.
    const diagnosis = await diagnoseModuleAccess(
      session, 'dormitory', hasDormitoryPrivilege as unknown as ModulePrivilegeCheck,
    )
    return <NoModuleAccess module="dormitory" required="view" diagnosis={diagnosis} />
  }

  const canManage = await hasDormitoryPrivilege(session, 'manage')

  return <DormBuildingsClient canManage={canManage} />
}
