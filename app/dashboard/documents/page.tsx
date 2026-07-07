import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
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
  if (!canView) redirect('/dashboard')

  const canManage = await hasDocumentsPrivilege(session, 'manage')

  return <DocumentsListClient canManage={canManage} />
}
