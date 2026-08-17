import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'
import TeachersHoursClient from './TeachersHoursClient'

/**
 * «מורים ושעות» — для אחראי לимודим: список преподавателей + недельные часы.
 * Доступ: view_students где-либо ИЛИ superadmin.
 */
export default async function TeachersHoursPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const ok = session.roles.includes('superadmin') || await canDoEducationInAny(session, 'view_students')
  if (!ok) redirect('/dashboard/education')

  return <TeachersHoursClient />
}
