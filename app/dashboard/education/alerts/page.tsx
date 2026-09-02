'use client'

import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import AlertsClient from './AlertsClient'

/**
 * Оповещения и задачи по студенткам (spec §4.4). Чувствительные оповещения
 * скрыты без view_sensitive_alerts (гранулярно, на API).
 */
export default function AlertsPage() {
  const tNav = useTranslations('navigation')
  const t = useTranslations('education.alerts')

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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>}
        title={t('title')}
        subtitle={t('subtitle')}
      />

      <AlertsClient />
    </div>
  )
}
