'use client'

import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import FinanceAdminClient from './FinanceAdminClient'

/**
 * Финансовые дефолты + утверждение скидок + просрочки (spec §3.9). Для
 * финансовой роли (НЕ Chana): редактирование гейтится на API (manage_budget /
 * approve_discount). §6.2 (кто утверждает) — открыт: владелец назначит роль.
 */
export default function FinanceAdminPage() {
  const tNav = useTranslations('navigation')
  const t = useTranslations('education.finance_admin')

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <ModuleHeader
        module="finance"
        compact
        icon={<svg style={{ width: 19, height: 19, color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>}
        title={t('title')}
        subtitle={t('subtitle')}
      />

      <FinanceAdminClient />
    </div>
  )
}
