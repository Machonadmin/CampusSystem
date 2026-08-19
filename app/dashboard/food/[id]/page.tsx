import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasFoodPrivilege } from '@/lib/food/permissions'
import FoodPlanDetailClient from './FoodPlanDetailClient'

/**
 * Карточка плана питания: записанные студенты + запись/завершение + диет-профиль.
 * Просмотр — food.view. Действия гейтятся canManage (с сервера).
 */
export default async function FoodPlanPage({ params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasFoodPrivilege(session, 'view')
  if (!canView) redirect('/dashboard')

  const canManage = await hasFoodPrivilege(session, 'manage')

  const sb = createServerClient()
  const { data: plan } = await sb
    .from('meal_plans')
    .select('id, name')
    .eq('id', params.id)
    .maybeSingle()

  if (!plan) notFound()

  return (
    <FoodPlanDetailClient
      planId={plan.id}
      planName={plan.name}
      canManage={canManage}
    />
  )
}
