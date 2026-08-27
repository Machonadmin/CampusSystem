import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { hasDoctorPrivilege } from '@/lib/doctor/permissions'
import { hasPsychologistPrivilege } from '@/lib/psychologist/permissions'
import HealthClient from './HealthClient'

/**
 * «Здоровье» — объединённый вход (owner-декластеризация): медпункт + психолог
 * под ОДНИМ пунктом меню. Доступ к обоим → страница с вкладками; доступ только
 * к одному → мгновенный редирект в него (человек видит свой привычный экран).
 * Старые адреса /dashboard/doctor и /dashboard/psychologist живут как раньше.
 */
export default async function HealthPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const canDoctor = await hasDoctorPrivilege(session, 'view')
  const canPsych = await hasPsychologistPrivilege(session, 'view')
  if (!canDoctor && !canPsych) redirect('/dashboard')
  if (canDoctor && !canPsych) redirect('/dashboard/doctor')
  if (!canDoctor && canPsych) redirect('/dashboard/psychologist')

  const canManageDoctor = await hasDoctorPrivilege(session, 'manage')
  const canManagePsych = await hasPsychologistPrivilege(session, 'manage')

  return <HealthClient canManageDoctor={canManageDoctor} canManagePsych={canManagePsych} />
}
