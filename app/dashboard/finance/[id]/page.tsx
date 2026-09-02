import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { phoneList } from '@/lib/persons/phone'
import { getSession } from '@/lib/auth/session'
import { hasFinancePrivilege } from '@/lib/finance/permissions'
import { canViewStudentFinanceFull, canManageStudentFinance } from '@/lib/finance/access'
import FinanceLedgerClient from './FinanceLedgerClient'

interface Props {
  params: { id: string }
}

/**
 * Финансовая карточка студента: ПНК (начисления + платежи + баланс).
 * Просмотр — под finance.view. Кнопки действий гейтятся ФЛАГАМИ, вычисленными
 * на сервере (canCreateInvoice / canApprove), а не только на клиенте.
 * Сами данные ПНК тянет клиент через /api/finance/journeys/[id]/ledger,
 * чтобы обновляться после каждой мутации.
 */
export default async function FinanceStudentPage({ params }: Props) {
  const session = await getSession()
  if (!session) redirect('/login')

  // Полная карточка ПНК = детализация → нужен ПОЛНЫЙ доступ (финотдел/грант),
  // не узкое «итоги студентки» (та видит только сумму в панели, без карточки).
  const canView = await canViewStudentFinanceFull(session, params.id)
  if (!canView) redirect('/dashboard')

  const sb = createServerClient()

  const { data: journey } = await sb
    .from('education_journeys')
    .select(`
      id, person_id, education_status,
      person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name, photo_url, phones)
    `)
    .eq('id', params.id)
    .maybeSingle()

  if (!journey) notFound()

  const j = journey as unknown as {
    id: string
    person_id: string
    education_status: string | null
    person: {
      id: string
      full_name: string | null
      hebrew_name: string | null
      photo_url: string | null
      phones: unknown
    } | null
  }

  const [canCreateInvoice, canApprove] = await Promise.all([
    canManageStudentFinance(session, params.id),
    hasFinancePrivilege(session, 'approve_payment'),
  ])

  return (
    <FinanceLedgerClient
      journeyId={j.id}
      fullName={j.person?.full_name ?? ''}
      hebrewName={j.person?.hebrew_name ?? null}
      photoUrl={j.person?.photo_url ?? null}
      phones={phoneList(j.person?.phones)}
      canCreateInvoice={canCreateInvoice}
      canApprove={canApprove}
    />
  )
}
