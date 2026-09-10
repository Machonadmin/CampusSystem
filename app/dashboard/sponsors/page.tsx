import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { diagnoseModuleAccess, type ModulePrivilegeCheck } from '@/lib/permissions/diagnose'
import NoModuleAccess from '@/components/dashboard/NoModuleAccess'
import { hasSponsorsPrivilege } from '@/lib/sponsors/permissions'
import SponsorsClient from './SponsorsClient'

/**
 * Спонсоры / Доноры: справочник доноров с суммой полученных пожертвований по
 * каждому, сводкой (получено/обещано), поиском и фильтром типа. Просмотр — под
 * sponsors.view. Действия (создание) гейтятся флагом canManage с сервера. Клик
 * по донору ведёт на карточку донора с реестром пожертвований.
 */
export default async function SponsorsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasSponsorsPrivilege(session, 'view')
  if (!canView) {
    // Не редирект: молчаливый возврат на главную неотличим от поломки.
    // Экран называет недостающее право и место, где его выдать.
    const diagnosis = await diagnoseModuleAccess(
      session, 'sponsors', hasSponsorsPrivilege as unknown as ModulePrivilegeCheck,
    )
    return <NoModuleAccess module="sponsors" required="view" diagnosis={diagnosis} />
  }

  const canManage = await hasSponsorsPrivilege(session, 'manage')

  return <SponsorsClient canManage={canManage} />
}
