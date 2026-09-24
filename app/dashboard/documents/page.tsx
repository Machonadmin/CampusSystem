import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { diagnoseModuleAccess, type ModulePrivilegeCheck } from '@/lib/permissions/diagnose'
import NoModuleAccess from '@/components/dashboard/NoModuleAccess'
import { hasDocumentsPrivilege } from '@/lib/documents/permissions'
import DocumentsListClient from './DocumentsListClient'

/**
 * Документы: список студентов с индикатором документов (число + бейдж
 * просрочки/скорого истечения) и worklist истекающих документов сверху.
 * Просмотр — под documents.view. Действия (добавление/архив/удаление) гейтятся
 * флагом canManage, вычисленным на сервере.
 */
export default async function DocumentsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasDocumentsPrivilege(session, 'view')
  if (!canView) {
    // Не редирект: молчаливый возврат на главную неотличим от поломки.
    // Экран называет недостающее право и место, где его выдать.
    const diagnosis = await diagnoseModuleAccess(
      session, 'documents', hasDocumentsPrivilege as unknown as ModulePrivilegeCheck,
    )
    return <NoModuleAccess module="documents" required="view" diagnosis={diagnosis} />
  }

  const canManage = await hasDocumentsPrivilege(session, 'manage')

  return <DocumentsListClient canManage={canManage} />
}
