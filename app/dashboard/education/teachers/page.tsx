import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'
import TeachersClient from './TeachersClient'

/**
 * «מורים» — объединённая страница (owner: «רעיון נהדר» на слияние):
 * вкладка «Часы» (бывш. מורים ושעות) + вкладка «Посещаемость» (בывш. נוכחות
 * מורים). Старые адреса редиректят сюда.
 * Доступ: любой сотрудник (учитель отмечает своё присутствие); вкладка часов —
 * только view_students/superadmin, подтверждение — manage_students/superadmin.
 */
export default async function TeachersPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.principal === 'student') redirect('/dashboard')

  const isSuper = session.roles.includes('superadmin')
  const canHours = isSuper || await canDoEducationInAny(session, 'view_students')
  const canApprove = isSuper || await canDoEducationInAny(session, 'manage_students')

  return <TeachersClient canHours={canHours} canApprove={canApprove} />
}
