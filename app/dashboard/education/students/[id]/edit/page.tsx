import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getCookieLocale } from '@/lib/i18n/locale'
import { requireEducationPrivilege, type EducationPrivilege } from '@/lib/education/permissions'
import ruMessages from '@/messages/ru.json'
import heMessages from '@/messages/he.json'
import enMessages from '@/messages/en.json'
import StudentEditClient from './StudentEditClient'

const messagesByLocale = { ru: ruMessages, he: heMessages, en: enMessages }

/** Статусы учебного цикла — редактирование карточки студентки. */
const STUDENT_LIFECYCLE = ['student', 'on_leave', 'graduated', 'expelled']

/** Привилегия управления по education_status journey. */
function pickManagePrivilege(status: string | null): EducationPrivilege {
  if (status === 'lead') return 'manage_leads'
  if (status === 'applicant') return 'manage_applicants'
  return 'manage_students'
}

interface Props {
  params: { id: string }
}

export default async function StudentEditPage({ params }: Props) {
  const sb = createServerClient()

  const { data: journey } = await sb
    .from('education_journeys')
    .select('id, education_status, primary_department_id, person:persons!applicant_profiles_person_id_fkey(full_name)')
    .eq('id', params.id)
    .maybeSingle()

  if (!journey) notFound()

  const status = (journey as unknown as { education_status: string | null }).education_status
  const deptId = (journey as unknown as { primary_department_id: string | null }).primary_department_id

  // Не студентка (лид/абитуриент) — правится через карточку гиюса.
  if (!status || !STUDENT_LIFECYCLE.includes(status)) {
    redirect(`/dashboard/education/leads/${params.id}/edit`)
  }

  // Право на управление студенткой (бросает 403, если нет).
  await requireEducationPrivilege(pickManagePrivilege(status), {
    department_id: deptId ?? undefined,
  })

  const person = (journey.person as unknown) as { full_name: string | null } | null
  const personName = person?.full_name ?? messagesByLocale[getCookieLocale()].education.card.status.student

  return <StudentEditClient journeyId={params.id} personName={personName} />
}
