'use client'

import { useTranslations } from '@/lib/i18n/LanguageContext'
import LeadViewClient, { type LeadViewData } from '../../education/leads/[id]/LeadViewClient'
import type { StatusHistoryEntry } from '@/components/education/StudentLifecyclePanel'
import AlumniProfilePanel, { type AlumniProfileData } from '@/components/alumni/AlumniProfilePanel'

interface Props {
  data: LeadViewData
  history: StatusHistoryEntry[]
  profile: AlumniProfileData | null
  canManage: boolean
}

/**
 * Клиентская обёртка карточки выпускника. Резолвит подписи модуля (клиентские
 * переводы недоступны в серверном компоненте) и переиспользует LeadViewClient:
 *   - данные персоны и история статусов — только просмотр (canManage=false);
 *   - редактируемая панель профиля выпускника — под alumni.manage.
 */
export default function AlumniCardClient({ data, history, profile, canManage }: Props) {
  const tNav = useTranslations('navigation')
  const t = useTranslations('alumni')

  return (
    <LeadViewClient
      data={data}
      showEditButton={false}
      canManage={false}
      canConvert={false}
      studyLifecycle={{ history }}
      navContext={{
        moduleLabel: tNav('alumni'),
        moduleHref: '/dashboard/alumni',
        colorKey: 'alumni',
        sectionLabel: t('card.section'),
      }}
      extraPanel={<AlumniProfilePanel profile={profile} canManage={canManage} />}
    />
  )
}
