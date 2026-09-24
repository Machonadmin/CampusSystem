import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { diagnoseModuleAccess, type ModulePrivilegeCheck } from '@/lib/permissions/diagnose'
import NoModuleAccess from '@/components/dashboard/NoModuleAccess'
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
  if (!canView) {
    // Не редирект: молчаливый возврат на главную неотличим от поломки.
    // Экран называет недостающее право и место, где его выдать.
    const diagnosis = await diagnoseModuleAccess(
      session, 'doctor', hasDoctorPrivilege as unknown as ModulePrivilegeCheck,
    )
    return <NoModuleAccess module="doctor" required="view" diagnosis={diagnosis} />
  }

  const canManage = await hasDoctorPrivilege(session, 'manage')

  return <DoctorListClient canManage={canManage} />
}
