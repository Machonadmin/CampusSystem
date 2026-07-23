import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import CalendarClient from './CalendarClient'

/**
 * ЛИЧНЫЙ календарь сотрудника. Только auth-gate: любой залогиненный пользователь
 * видит СВОЙ календарь (provider_id = session.person_id). Это НЕ модуль из
 * PROTECTED_MODULES и НЕ требует привилегии — изоляция обеспечивается фильтром
 * provider_id в каждом запросе API.
 */
export default async function CalendarPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return <CalendarClient />
}
