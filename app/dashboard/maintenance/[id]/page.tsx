import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasMaintenancePrivilege } from '@/lib/maintenance/permissions'
import MaintenanceDetailClient from './MaintenanceDetailClient'

/**
 * Карточка заявки на обслуживание: смена статуса (только допустимые переходы),
 * назначение, приоритет, описание. Просмотр — maintenance.view. Действия под
 * maintenance.manage гейтятся флагом canManage (с сервера).
 */
export default async function MaintenanceRequestPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasMaintenancePrivilege(session, 'view')
  if (!canView) redirect('/dashboard')

  const canManage = await hasMaintenancePrivilege(session, 'manage')

  const sb = createServerClient()
  const { data: ticket } = await sb
    .from('maintenance_requests')
    .select('id, title')
    .eq('id', params.id)
    .maybeSingle()

  if (!ticket) notFound()

  return (
    <MaintenanceDetailClient
      ticketId={ticket.id}
      ticketTitle={ticket.title}
      canManage={canManage}
      currentPersonId={session.person_id}
    />
  )
}
