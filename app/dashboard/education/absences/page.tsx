import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import AbsencesClient from './AbsencesClient'

/**
 * «טיפול בהעדרויות» — случаи отсутствия: пометить и передать подразделению.
 * Страница доступна сотруднику; что он видит/может — решает API (менеджер видит
 * все, сотрудник — переданные его подразделению).
 */
export default async function AbsencesPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.principal === 'student') redirect('/dashboard')
  return <AbsencesClient />
}
