import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import LeadCardClient from './LeadCardClient'

interface Props {
  params: { id: string }
}

export default async function LeadCardPage({ params }: Props) {
  const sb = createServerClient()

  const { data: journey } = await sb
    .from('education_journeys')
    .select('id, person:persons(full_name)')
    .eq('id', params.id)
    .maybeSingle()

  if (!journey) notFound()

  const person = (journey.person as unknown) as { full_name: string | null } | null
  const personName = person?.full_name ?? 'Лид'

  return <LeadCardClient journeyId={params.id} personName={personName} />
}
