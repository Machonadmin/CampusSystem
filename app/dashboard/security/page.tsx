import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { diagnoseModuleAccess, type ModulePrivilegeCheck } from '@/lib/permissions/diagnose'
import NoModuleAccess from '@/components/dashboard/NoModuleAccess'
import { hasSecurityPrivilege } from '@/lib/security/permissions'
import SecurityListClient from './SecurityListClient'

/**
 * Журнал инцидентов безопасности. Просмотр — под security.view. Кнопки (новый
 * инцидент и т. п.) гейтятся флагом canManage, вычисленным на сервере.
 */
export default async function SecurityPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasSecurityPrivilege(session, 'view')
  if (!canView) {
    // Не редирект: молчаливый возврат на главную неотличим от поломки.
    // Экран называет недостающее право и место, где его выдать.
    const diagnosis = await diagnoseModuleAccess(
      session, 'security', hasSecurityPrivilege as unknown as ModulePrivilegeCheck,
    )
    return <NoModuleAccess module="security" required="view" diagnosis={diagnosis} />
  }

  const canManage = await hasSecurityPrivilege(session, 'manage')

  return <SecurityListClient canManage={canManage} />
}
