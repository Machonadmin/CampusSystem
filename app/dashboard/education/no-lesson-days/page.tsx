'use client'

import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { BackButton } from '@/components/ui/BackButton'
import { useSectionCrumb } from '../components/useSectionCrumb'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import NoLessonDaysClient from './NoLessonDaysClient'

/**
 * Дни без уроков (ימים ללא לימודים) — spec §3.4 / §4.5. Порождение уроков
 * пропускает эти даты. Гейт по manage_class_groups на API.
 */
export default function NoLessonDaysPage() {
  const tNav = useTranslations('navigation')
  const sectionCrumb = useSectionCrumb('studies')
  const t = useTranslations('education.no_lesson_days')

  return (
    <div className="p-6 space-y-5">

      <ModuleHeader
        breadcrumb={[
        { label: tNav('home'), href: '/dashboard' },
        sectionCrumb,
        { label: t('title') },
      ]}
        module="education"
        compact
        icon={<svg style={{ width: 19, height: 19, color: 'currentColor' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>}
        title={t('title')}
        subtitle={t('subtitle')}
        actions={<BackButton fallback={sectionCrumb.href} />}
      />

      <NoLessonDaysClient />
    </div>
  )
}
