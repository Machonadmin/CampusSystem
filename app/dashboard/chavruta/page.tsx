import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import ChavrutaTeacherClient from './ChavrutaTeacherClient'

/**
 * Страница преподавателя хеврута (§B): «с кем я занимаюсь сегодня» + журнал
 * занятий за выбранную дату. Строгая проверка доступа не нужна — API
 * (GET /api/chavruta/students) сам вернёт 403 не-преподавателю, и клиент
 * покажет «эта страница для преподавателей хеврута».
 */
export default async function ChavrutaTeacherPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return <ChavrutaTeacherClient />
}
