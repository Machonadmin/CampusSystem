import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
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
  if (!canView) redirect('/dashboard')

  const canManage = await hasPsychologistPrivilege(session, 'manage')

  return <PsychologistListClient canManage={canManage} />
}
