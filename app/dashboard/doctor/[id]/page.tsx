import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasDoctorPrivilege } from '@/lib/doctor/permissions'
import DoctorStudentClient from './DoctorStudentClient'

/**
 * Медкарта студента: панель профиля (правка), история приёмов, запись приёма,
 * закрытие/переоткрытие. Просмотр — doctor.view. Действия гейтятся canManage
 * (с сервера). [id] = journey_id. ЧУВСТВИТЕЛЬНЫЕ ДАННЫЕ.
 */
export default async function DoctorStudentPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasDoctorPrivilege(session, 'view')
  if (!canView) redirect('/dashboard')

  const canManage = await hasDoctorPrivilege(session, 'manage')

  const sb = createServerClient()
  const { data: journey } = await sb
    .from('education_journeys')
    .select(`
      id,
      person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name)
    `)
    .eq('id', params.id)
    .maybeSingle()

  if (!journey) notFound()

  const person = journey.person as { full_name?: string | null; hebrew_name?: string | null } | null
  const studentName = person?.full_name || person?.hebrew_name || '—'

  return (
    <DoctorStudentClient
      journeyId={journey.id}
      studentName={studentName}
      canManage={canManage}
    />
  )
}
