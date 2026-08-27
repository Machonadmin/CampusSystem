'use client'

import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import SubjectsTab from '../components/SubjectsTab'

// Отдельный маршрут для מקצועות (subjects). Раньше создание предмета было
// спрятано в «הגדרות לימודים → מקצועות», и владелец его не находил (жал похоже
// названную карточку «מבנה אקדמי», которая ведёт в дерево единиц). Теперь у
// предметов есть своя карточка на дашборде «Учёбы» и свой маршрут.
export default function SubjectsPage() {
  const tNav = useTranslations('navigation')
  const t = useTranslations('education.study')

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('tabs.subjects') },
      ]} />

      <ModuleHeader
        module="education"
        compact
        icon={<svg style={{ width: 19, height: 19, color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>}
        title={t('tabs.subjects')}
      />

      <SubjectsTab />
    </div>
  )
}
