import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'

/**
 * ЛЕГАСИ-хаб «חינוך» + цель хлебной крошки «חינוך». Разделы живут на своих
 * маршрутах (recruitment / admission / studies). Раньше редирект был жёстко на
 * recruitment — но роли без view_leads (преподаватель, אחראית יהדות и т.п.)
 * попадали на fail-closed «нет доступа». Теперь ведём на ПЕРВЫЙ доступный раздел.
 */
export default async function EducationHubRedirect() {
  const session = await getSession()
  if (!session) redirect('/login')

  if (session.roles.includes('superadmin')) redirect('/dashboard/education/recruitment')
  if (await canDoEducationInAny(session, 'view_leads')) redirect('/dashboard/education/recruitment')
  if (await canDoEducationInAny(session, 'view_applicants')) redirect('/dashboard/education/admission')
  if (await canDoEducationInAny(session, 'view_students')) redirect('/dashboard/education/studies')

  // Нет ни одного образовательного просмотрового права — на главную.
  redirect('/dashboard')
}
