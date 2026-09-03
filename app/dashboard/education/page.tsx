import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'
import { resolveEducationHubTarget } from '@/lib/education/education-hub'
import EducationHub from './components/EducationHub'

/**
 * Хаб «חינוך» + цель хлебной крошки «חинуך». Разделы живут на своих маршрутах
 * (recruitment / admission / studies). РАНЬШЕ страница всегда редиректила по
 * приоритету прав, поэтому пользователя учёбы, у которого есть и view_applicants,
 * уносило на приём — сюрприз. ТЕПЕРЬ: доступен ровно один раздел → уводим прямо
 * туда; доступно два и больше → показываем настоящий хаб с выбором; ноль →
 * fail-closed на главную. Решение — чистая resolveEducationHubTarget.
 */
export default async function EducationHubPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const isSuper = session.roles.includes('superadmin')
  const [recruitment, admission, studies] = isSuper
    ? [true, true, true]
    : await Promise.all([
        canDoEducationInAny(session, 'view_leads'),
        canDoEducationInAny(session, 'view_applicants'),
        canDoEducationInAny(session, 'view_students'),
      ])

  const target = resolveEducationHubTarget({ recruitment, admission, studies })
  if (target.kind === 'redirect') redirect(target.href)

  return <EducationHub sections={target.sections} />
}
