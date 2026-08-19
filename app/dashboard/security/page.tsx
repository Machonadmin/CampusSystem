import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
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
  if (!canView) redirect('/dashboard')

  const canManage = await hasSecurityPrivilege(session, 'manage')

  return <SecurityListClient canManage={canManage} />
}
