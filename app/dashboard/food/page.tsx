import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { diagnoseModuleAccess, type ModulePrivilegeCheck } from '@/lib/permissions/diagnose'
import NoModuleAccess from '@/components/dashboard/NoModuleAccess'
import { hasFoodPrivilege } from '@/lib/food/permissions'
import FoodPlansClient from './FoodPlansClient'

/**
 * Список планов питания. Просмотр — под food.view. Кнопки правки (добавить
 * план и т. п.) гейтятся флагом canManage, вычисленным на сервере.
 */
export default async function FoodPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasFoodPrivilege(session, 'view')
  if (!canView) {
    // Не редирект: молчаливый возврат на главную неотличим от поломки.
    // Экран называет недостающее право и место, где его выдать.
    const diagnosis = await diagnoseModuleAccess(
      session, 'food', hasFoodPrivilege as unknown as ModulePrivilegeCheck,
    )
    return <NoModuleAccess module="food" required="view" diagnosis={diagnosis} />
  }

  const canManage = await hasFoodPrivilege(session, 'manage')

  return <FoodPlansClient canManage={canManage} />
}
