import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'
import AssignmentBoardClient from './AssignmentBoardClient'

/**
 * «שיבוץ» — доска перетаскивания: ученицы/преподаватели → учебные группы.
 * Доступ: superadmin ИЛИ manage_enrollments / manage_class_teachers где-либо.
 */
export default async function AssignmentPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const ok = session.roles.includes('superadmin')
    || await canDoEducationInAny(session, 'manage_enrollments')
    || await canDoEducationInAny(session, 'manage_class_teachers')
  if (!ok) redirect('/dashboard/education')
  return <AssignmentBoardClient />
}
