'use client'

import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import KodeshRavClient from './KodeshRavClient'

/**
 * Экран Рава (spec §4.8): очередь утверждений преподавателей + часовые квоты.
 * Действия гейтятся на API (approve_kodesh_teacher / set_teacher_quota).
 */
export default function KodeshRavPage() {
  const tNav = useTranslations('navigation')
  const t = useTranslations('education.kodesh_rav')

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <ModuleHeader
        module="education"
        compact
        icon={<svg style={{ width: 19, height: 19, color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>}
        title={t('title')}
        subtitle={t('subtitle')}
      />

      <KodeshRavClient />
    </div>
  )
}
