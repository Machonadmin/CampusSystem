import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
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
  if (!canView) redirect('/dashboard')

  const canManage = await hasDormitoryPrivilege(session, 'manage')

  return <DormBuildingsClient canManage={canManage} />
}
