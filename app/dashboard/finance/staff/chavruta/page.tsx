import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canViewStaffComp } from '@/lib/finance/staff-comp'
import ChavrutaTeachersClient from './ChavrutaTeachersClient'

/**
 * Список преподавателей хеврута — ТОЛЬКО ЧТЕНИЕ (решение владельца #6: мор и
 * пары ведут в «מרכז חברותא», /dashboard/education/chavruta). Живёт рядом с
 * расчётными листами (finance/staff), доступ — canViewStaffComp. Список тянет
 * клиент через /api/chavruta/teachers.
 */
export default async function ChavrutaTeachersPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!(await canViewStaffComp(session))) redirect('/dashboard')

  return <ChavrutaTeachersClient />
}
