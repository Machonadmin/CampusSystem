import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canViewStudentFinanceFull } from '@/lib/finance/access'
import ReceiptClient from './ReceiptClient'

interface Props {
  params: { paymentId: string }
}

/**
 * Печатная квитанция (קבלה) об ОДНОМ подтверждённом платеже.
 *
 * Доступ — та же проверка, что и для ПНК студентки (canViewStudentFinance по
 * journey платежа). Печатать имеет смысл только ПОДТВЕРЖДЁННЫЙ платёж; для
 * pending/cancelled показываем предупреждение (клиент), но данные всё равно
 * читаем, чтобы не плодить состояний.
 *
 * Новые реквизиты (deposited_to/…/signer_name) появились миграцией
 * 20260719120000 — читаем деплой-безопасно (probe на 42703).
 */
export default async function ReceiptPage({ params }: Props) {
  const session = await getSession()
  if (!session) redirect('/login')

  const sb = createServerClient()

  const BASE = 'id, journey_id, amount, paid_at, method, reference, status, approved_at'
  const FULL = `${BASE}, deposited_to, from_account, to_account, signer_name, typed_name, signed_at`
  let cols = FULL
  {
    const probe = await sb.from('finance_payments').select(FULL).limit(1)
    if (probe.error && (probe.error as { code?: string }).code === '42703') cols = BASE
  }

  const { data: payment } = await sb
    .from('finance_payments')
    .select(cols)
    .eq('id', params.paymentId)
    .maybeSingle()

  if (!payment) notFound()

  const p = payment as unknown as {
    id: string
    journey_id: string
    amount: number | string
    paid_at: string | null
    method: string | null
    reference: string | null
    status: 'pending' | 'approved' | 'cancelled'
    approved_at: string | null
    deposited_to?: string | null
    from_account?: string | null
    to_account?: string | null
    signer_name?: string | null
    typed_name?: string | null
    signed_at?: string | null
  }

  // Доступ — по journey платежа (глобальный финотдел ИЛИ персональный грант).
  // Квитанция = детализация платежа (метод/реквизиты) → только ПОЛНЫЙ доступ,
  // не «итоги студентки».
  if (!(await canViewStudentFinanceFull(session, p.journey_id))) redirect('/dashboard')

  const { data: journey } = await sb
    .from('education_journeys')
    .select(`
      id,
      person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name)
    `)
    .eq('id', p.journey_id)
    .maybeSingle()

  const j = journey as unknown as {
    id: string
    person: { id: string; full_name: string | null; hebrew_name: string | null } | null
  } | null

  return (
    <ReceiptClient
      payment={{
        id: p.id,
        amount: Number(p.amount),
        paid_at: p.paid_at,
        method: p.method,
        reference: p.reference,
        status: p.status,
        approved_at: p.approved_at,
        deposited_to: p.deposited_to ?? null,
        from_account: p.from_account ?? null,
        to_account: p.to_account ?? null,
        signer_name: p.signer_name ?? null,
        typed_name: p.typed_name ?? null,
        signed_at: p.signed_at ?? null,
      }}
      journeyId={p.journey_id}
      studentName={j?.person?.full_name ?? ''}
      studentHebrewName={j?.person?.hebrew_name ?? null}
    />
  )
}
