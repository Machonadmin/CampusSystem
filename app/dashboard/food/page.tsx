import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
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
  if (!canView) redirect('/dashboard')

  const canManage = await hasFoodPrivilege(session, 'manage')

  return <FoodPlansClient canManage={canManage} />
}
