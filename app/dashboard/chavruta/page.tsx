import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import ChavrutaTeacherClient from './ChavrutaTeacherClient'
import { isIsoDate } from '@/lib/dates'

/**
 * Страница преподавателя хеврута (§B): «с кем я занимаюсь сегодня» + журнал
 * занятий за выбранную дату. Строгая проверка доступа не нужна — API
 * (GET /api/chavruta/students) сам вернёт 403 не-преподавателю, и клиент
 * покажет «эта страница для преподавателей хеврута».
 */
export default async function ChavrutaTeacherPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await getSession()
  if (!session) redirect('/login')

  // ?date= — из уведомлений «חברותא קבועה»: открыть журнал на день встречи.
  const { date } = await searchParams
  return <ChavrutaTeacherClient initialDate={date && isIsoDate(date) ? date : undefined} />
}
