import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { createServerClient } from '@/lib/supabase/server'
import { canViewStaffComp, canManageStaffComp, canApprovePayslip, canAccessStaffCompPerson, isSelfCompTarget } from '@/lib/finance/staff-comp'
import PayslipClient from './PayslipClient'

interface Props {
  params: Promise<{ personId: string }>
}

/**
 * Расчётный лист сотрудника (тлуш שכר). Просмотр — под finance.view; кнопки
 * действий гейтятся ФЛАГАМИ (canManage / canApprove), вычисленными на сервере.
 * Данные (тарифы, записи, свод) тянет клиент, чтобы обновляться после мутаций.
 */
export default async function StaffPayslipPage(props: Props) {
  const params = await props.params
  const session = await getSession()
  if (!session) redirect('/login')
  if (!(await canViewStaffComp(session))) redirect('/dashboard')
  if (!(await canAccessStaffCompPerson(session, params.personId, 'view'))) redirect('/dashboard/finance/staff')

  // Кнопки — только если API их пропустит: не своя зарплата и сотрудник в scope права.
  const self = isSelfCompTarget(session, params.personId)
  const [canManage, canApprove] = await Promise.all([
    (async () => !self && await canManageStaffComp(session) && await canAccessStaffCompPerson(session, params.personId, 'create_invoice'))(),
    (async () => !self && await canApprovePayslip(session) && await canAccessStaffCompPerson(session, params.personId, 'approve_payment'))(),
  ])

  // Имя сотрудника — читаем напрямую (клиентские API расчётного листа его не
  // возвращают). Если персона не найдена — покажем id, страница не падает.
  const sb = createServerClient()
  const { data: person } = await sb
    .from('persons')
    .select('full_name, hebrew_name')
    .eq('id', params.personId)
    .maybeSingle()

  const p = person as { full_name: string | null; hebrew_name: string | null } | null

  return (
    <PayslipClient
      personId={params.personId}
      fullName={p?.full_name ?? ''}
      hebrewName={p?.hebrew_name ?? null}
      canManage={canManage}
      canApprove={canApprove}
    />
  )
}
