import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasDocumentsPrivilege } from '@/lib/documents/permissions'
import DocumentsStudentClient from './DocumentsStudentClient'

/**
 * Документы студента: реестр документов (тип, статус, срок годности), форма
 * добавления, архивирование/удаление. Просмотр — documents.view. Действия
 * гейтятся canManage (с сервера). [id] = journey_id.
 */
export default async function DocumentsStudentPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasDocumentsPrivilege(session, 'view')
  if (!canView) redirect('/dashboard')

  const canManage = await hasDocumentsPrivilege(session, 'manage')

  const sb = createServerClient()
  const { data: journey } = await sb
    .from('education_journeys')
    .select(`
      id,
      person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name)
    `)
    .eq('id', params.id)
    .maybeSingle()

  if (!journey) notFound()

  const person = journey.person as { full_name?: string | null; hebrew_name?: string | null } | null
  const studentName = person?.full_name || person?.hebrew_name || '—'

  return (
    <DocumentsStudentClient
      journeyId={journey.id}
      studentName={studentName}
      canManage={canManage}
    />
  )
}
