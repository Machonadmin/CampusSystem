import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { hasPersonsPrivilege } from '@/lib/persons/permissions'
import { hasEducationPrivilege } from '@/lib/education/permissions'
import PersonDetailClient from './PersonDetailClient'

/**
 * Карточка человека (ЧИТАЮЩАЯ): базовый профиль из /api/persons/directory/[id].
 * Ссылка «К карточке студента» показывается, только если человек — студент И у
 * зрителя есть education.view_students (вычисляется на сервере).
 */
export default async function PersonDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasPersonsPrivilege(session, 'view')
  if (!canView) redirect('/dashboard')

  const canViewStudentCards = await hasEducationPrivilege(session, 'view_students')

  return <PersonDetailClient personId={params.id} canViewStudentCards={canViewStudentCards} />
}
