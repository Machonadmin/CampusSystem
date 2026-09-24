import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canViewStaffComp } from '@/lib/finance/staff-comp'
import ChavrutaTeachersClient from './ChavrutaTeachersClient'

/**
 * Список преподавателей хеврута (§C) — ТОЛЬКО ПРОСМОТР рядом с расчётными
 * листами (finance/staff), доступ — под тем же canViewStaffComp. Управление
 * (добавить/убрать мору, пары) — только в «מרכז חברותא» (решение владельца №6).
 * Список тянет клиент через /api/chavruta/teachers.
 */
export default async function ChavrutaTeachersPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!(await canViewStaffComp(session))) redirect('/dashboard')

  return <ChavrutaTeachersClient />
}
