import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import LeadEditClient from './LeadEditClient'

interface Props {
  params: { id: string }
}

export default async function LeadEditPage({ params }: Props) {
  const sb = createServerClient()

  const { data: journey } = await sb
    .from('education_journeys')
    .select('id, person:persons!applicant_profiles_person_id_fkey(full_name)')
    .eq('id', params.id)
    .maybeSingle()

  if (!journey) notFound()

  const person = (journey.person as unknown) as { full_name: string | null } | null
  const personName = person?.full_name ?? 'Лид'

  return <LeadEditClient journeyId={params.id} personName={personName} />
}
