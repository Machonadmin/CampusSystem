import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { hasPersonsPrivilege } from '@/lib/persons/permissions'
import { hasEducationPrivilege } from '@/lib/education/permissions'
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
  if (!canView) redirect('/dashboard')

  const canViewStudentCards = await hasEducationPrivilege(session, 'view_students')

  return <PersonsClient canViewStudentCards={canViewStudentCards} />
}
