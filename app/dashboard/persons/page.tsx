import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { diagnoseModuleAccess, type ModulePrivilegeCheck } from '@/lib/permissions/diagnose'
import NoModuleAccess from '@/components/dashboard/NoModuleAccess'
import { hasPersonsPrivilege } from '@/lib/persons/permissions'
import PersonsClient from './PersonsClient'

/**
 * Люди: ЧИТАЮЩИЙ справочник сотрудников и студентов для поиска человека и его
 * контактов. Просмотр — под persons.view. Ссылка на карточку студента
 * показывается, только если у зрителя ещё и education.view_students —
 * вычисляется на сервере и прокидывается флагом.
 */
export default async function PersonsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasPersonsPrivilege(session, 'view')
  if (!canView) {
    // Не редирект: молчаливый возврат на главную неотличим от поломки.
    // Экран называет недостающее право и место, где его выдать.
    const diagnosis = await diagnoseModuleAccess(
      session, 'persons', hasPersonsPrivilege as unknown as ModulePrivilegeCheck,
    )
    return <NoModuleAccess module="persons" required="view" diagnosis={diagnosis} />
  }


  return <PersonsClient />
}
