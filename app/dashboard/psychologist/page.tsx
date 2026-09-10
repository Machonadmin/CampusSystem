import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { diagnoseModuleAccess, type ModulePrivilegeCheck } from '@/lib/permissions/diagnose'
import NoModuleAccess from '@/components/dashboard/NoModuleAccess'
import { hasPsychologistPrivilege } from '@/lib/psychologist/permissions'
import PsychologistListClient from './PsychologistListClient'

/**
 * Психолог: список студентов с индикатором риска + worklist контрольных
 * консультаций. Просмотр — под psychologist.view. Действия (карта, консультации)
 * гейтятся флагом canManage, вычисленным на сервере. ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ.
 */
export default async function PsychologistPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasPsychologistPrivilege(session, 'view')
  if (!canView) {
    // Не редирект: молчаливый возврат на главную неотличим от поломки.
    // Экран называет недостающее право и место, где его выдать.
    const diagnosis = await diagnoseModuleAccess(
      session, 'psychologist', hasPsychologistPrivilege as unknown as ModulePrivilegeCheck,
    )
    return <NoModuleAccess module="psychologist" required="view" diagnosis={diagnosis} />
  }

  const canManage = await hasPsychologistPrivilege(session, 'manage')

  return <PsychologistListClient canManage={canManage} />
}
