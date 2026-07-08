import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasSecurityPrivilege } from '@/lib/security/permissions'
import SecurityDetailClient from './SecurityDetailClient'

/**
 * Карточка инцидента безопасности: смена статуса (только допустимые переходы),
 * назначение, серьёзность, разрешение. Просмотр — security.view. Действия под
 * security.manage гейтятся флагом canManage (с сервера).
 */
export default async function SecurityIncidentPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasSecurityPrivilege(session, 'view')
  if (!canView) redirect('/dashboard')

  const canManage = await hasSecurityPrivilege(session, 'manage')

  const sb = createServerClient()
  const { data: incident } = await sb
    .from('security_incidents')
    .select('id, title')
    .eq('id', params.id)
    .maybeSingle()

  if (!incident) notFound()

  return (
    <SecurityDetailClient
      incidentId={incident.id}
      incidentTitle={incident.title}
      canManage={canManage}
      currentPersonId={session.person_id}
    />
  )
}
