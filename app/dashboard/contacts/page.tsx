import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { diagnoseModuleAccess, type ModulePrivilegeCheck } from '@/lib/permissions/diagnose'
import NoModuleAccess from '@/components/dashboard/NoModuleAccess'
import { hasContactsPrivilege } from '@/lib/contacts/permissions'
import ContactsClient from './ContactsClient'

/**
 * Контакты: справочник внешних контактов и организаций (поставщики, партнёры,
 * госорганы, экстренные) с поиском, фильтром категории и сводкой. Просмотр —
 * под contacts.view. Действия (создание/правка/удаление) гейтятся флагом
 * canManage, вычисленным на сервере.
 */
export default async function ContactsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasContactsPrivilege(session, 'view')
  if (!canView) {
    // Не редирект: молчаливый возврат на главную неотличим от поломки.
    // Экран называет недостающее право и место, где его выдать.
    const diagnosis = await diagnoseModuleAccess(
      session, 'contacts', hasContactsPrivilege as unknown as ModulePrivilegeCheck,
    )
    return <NoModuleAccess module="contacts" required="view" diagnosis={diagnosis} />
  }

  const canManage = await hasContactsPrivilege(session, 'manage')

  return <ContactsClient canManage={canManage} />
}
