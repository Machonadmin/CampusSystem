import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { canDoEducationInAny } from '@/lib/education/permissions'
import SurveyDetailClient from './SurveyDetailClient'

export default async function SurveyDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const session = await getSession()
  if (!session) redirect('/login')
  const ok = session.roles.includes('superadmin') || (await canDoEducationInAny(session, 'manage_students'))
  if (!ok) redirect('/dashboard/education')
  return <SurveyDetailClient surveyId={params.id} />
}
