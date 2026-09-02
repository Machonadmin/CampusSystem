'use client'

import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import KodeshHomeClient from './KodeshHomeClient'

/**
 * Два домашних экрана мод. иудаики (spec §4.2): подготовка семестра и семестр.
 * Переключатель ручной; авто-дефолт по наличию нераспределённых студенток.
 */
export default function KodeshHomePage() {
  const tNav = useTranslations('navigation')
  const t = useTranslations('education.kodesh_home')

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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
        </svg>}
        title={t('title')}
        subtitle={t('subtitle')}
      />

      <KodeshHomeClient />
    </div>
  )
}
