import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasDormitoryPrivilege } from '@/lib/dormitory/permissions'
import DormBuildingDetailClient from './DormBuildingDetailClient'

/**
 * Карточка здания: комнаты + занятость + назначения. Просмотр — dormitory.view.
 * Действия (добавить комнату, назначить/завершить) гейтятся canManage.
 */
export default async function DormBuildingPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasDormitoryPrivilege(session, 'view')
  if (!canView) redirect('/dashboard')

  const canManage = await hasDormitoryPrivilege(session, 'manage')

  const sb = createServerClient()
  const { data: building } = await sb
    .from('dorm_buildings')
    .select('id, name')
    .eq('id', params.id)
    .maybeSingle()

  if (!building) notFound()

  return (
    <DormBuildingDetailClient
      buildingId={building.id}
      buildingName={building.name}
      canManage={canManage}
    />
  )
}
