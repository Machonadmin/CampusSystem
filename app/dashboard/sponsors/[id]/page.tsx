import { notFound, redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasSponsorsPrivilege } from '@/lib/sponsors/permissions'
import SponsorDetailClient from './SponsorDetailClient'
import type { SponsorRow } from '@/types/database'

interface Props {
  params: { id: string }
}

/**
 * Карточка донора: реквизиты донора + реестр его пожертвований (сумма/дата/
 * назначение/кампания/способ/статус) со сводкой. Просмотр — под sponsors.view.
 * Действия (правка донора, запись/правка пожертвований) гейтятся флагом
 * canManage, вычисленным на сервере. Сами пожертвования тянет клиент через
 * /api/sponsors/[id]/donations, чтобы обновляться после каждой мутации.
 */
export default async function SponsorDetailPage({ params }: Props) {
  const session = await getSession()
  if (!session) redirect('/login')

  const canView = await hasSponsorsPrivilege(session, 'view')
  if (!canView) redirect('/dashboard')

  const sb = createServerClient()
  const { data: sponsor } = await sb
    .from('sponsors')
    .select('id, name, sponsor_type, email, phone, address, contact_person, notes, is_active, created_by, created_at, updated_at')
    .eq('id', params.id)
    .maybeSingle()

  if (!sponsor) notFound()

  const canManage = await hasSponsorsPrivilege(session, 'manage')

  return (
    <SponsorDetailClient
      sponsor={sponsor as unknown as SponsorRow}
      canManage={canManage}
    />
  )
}
