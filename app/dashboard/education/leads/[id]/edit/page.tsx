import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getCookieLocale } from '@/lib/i18n/locale'
import ruMessages from '@/messages/ru.json'
import heMessages from '@/messages/he.json'
import enMessages from '@/messages/en.json'
import LeadEditClient from './LeadEditClient'

const messagesByLocale = { ru: ruMessages, he: heMessages, en: enMessages }

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
  const personName = person?.full_name ?? messagesByLocale[getCookieLocale()].education.card.status.lead

  return <LeadEditClient journeyId={params.id} personName={personName} />
}
