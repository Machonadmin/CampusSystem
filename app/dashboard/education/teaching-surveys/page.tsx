import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'
import TeachingSurveysClient from './TeachingSurveysClient'

/**
 * «הערכת הוראה» — сборы обратной связи о преподавании (менеджер).
 * Доступ: manage_students где-либо ИЛИ superadmin.
 */
export default async function TeachingSurveysPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const ok = session.roles.includes('superadmin') || await canDoEducationInAny(session, 'manage_students')
  if (!ok) redirect('/dashboard/education')
  return <TeachingSurveysClient />
}
