import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { hasDoctorPrivilege } from '@/lib/doctor/permissions'
import DoctorListClient from './DoctorListClient'

/**
 * Медпункт: список студентов с индикатором здоровья + worklist контрольных
 * визитов. Просмотр — под doctor.view. Действия (медкарта, приёмы) гейтятся
 * флагом canManage, вычисленным на сервере. ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ.
 */
export default async function DoctorPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasDoctorPrivilege(session, 'view')
  if (!canView) redirect('/dashboard')

  const canManage = await hasDoctorPrivilege(session, 'manage')

  return <DoctorListClient canManage={canManage} />
}
