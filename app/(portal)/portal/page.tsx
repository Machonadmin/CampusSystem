import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import PortalClient from './PortalClient'

/**
 * Личный кабинет студентки. Доступ только для principal:'student' с
 * student_journey_id — иначе на страницу входа. Панели питаются её собственной
 * journey (её own-journey-доступ проверяется в самих API-маршрутах).
 */
export default async function PortalPage() {
  const session = await getSession()
  if (!session || session.principal !== 'student' || !session.student_journey_id) {
    redirect('/portal/login')
  }

  return <PortalClient journeyId={session.student_journey_id} name={session.full_name ?? ''} />
}
