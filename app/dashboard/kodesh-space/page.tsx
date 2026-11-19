import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { hasPrivilege } from '@/lib/auth/module-privileges'
import { diagnoseModuleAccess } from '@/lib/permissions/diagnose'
import NoModuleAccess from '@/components/dashboard/NoModuleAccess'
import { canEnterKodeshSpace } from '@/lib/kodesh-space/access'
import KodeshSpaceClient from './KodeshSpaceClient'

/**
 * «מרחב יהדות» — модуль меню (kodesh_space). Решение владельца 19.11.2026:
 * раньше это был отдельный «дом» управляющей кафедрой иудаики (посадка после
 * входа, свой сайдбар), и он путался с общей главной. Теперь главная одна для
 * всех, а сюда входят по праву kodesh_space.access (lib/kodesh-space/access.ts).
 */
export default async function KodeshSpacePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  if (!(await canEnterKodeshSpace(session))) {
    const diagnosis = await diagnoseModuleAccess(
      session, 'kodesh_space',
      (s, code) => hasPrivilege(s, 'kodesh_space', code),
    )
    return <NoModuleAccess module="kodesh_space" required="access" diagnosis={diagnosis} />
  }

  return <KodeshSpaceClient />
}
