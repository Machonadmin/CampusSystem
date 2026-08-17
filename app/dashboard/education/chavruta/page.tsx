import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canViewChavruta, canManageChavruta } from '@/lib/chavruta/access'
import ChavrutaHubClient from './ChavrutaHubClient'

/**
 * «מרכז חברותא» — управляющий хаб хавруты внутри модуля «Лимудим». По запросу
 * владельца («почему я ничего не могу сделать в хаврутах?»): раньше карточка вела
 * на страницу МОРЫ (журнал занятий), недоступную менеджеру. Здесь менеджер
 * видит и делает: мאגр מорот (пул), шиюх мора↔ученица, и переход в журнал.
 *
 * Доступ — как у staff-comp (пул мор и пары живут там же). Не-менеджер уходит на
 * дашборд лимудим.
 */
export default async function ChavrutaHubPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!(await canViewChavruta(session))) redirect('/dashboard/education')

  const canManage = await canManageChavruta(session)

  return <ChavrutaHubClient canManage={canManage} />
}
