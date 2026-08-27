'use client'

import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'

// «משתמשים וגישה» и «רשימת תפקידים» переехали в объединённый хаб «צוות»
// (вкладки users / positions) — здесь их больше нет, чтобы не дублировать.
const SECTIONS = [
  {
    key: 'roles',
    href: '/dashboard/settings/roles',
    iconPath: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    bg: 'var(--violet-tint)', color: '#7C3AED',
  },
  {
    key: 'reference_cities',
    href: '/dashboard/settings/reference-cities',
    iconPath: 'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418',
    bg: 'var(--info-tint)', color: 'var(--accent-strong)',
  },
  {
    key: 'workflows',
    href: '/dashboard/settings/workflows',
    iconPath: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
    bg: 'var(--violet-tint)', color: '#4F46E5',
  },
]

export default function SettingsPage() {
  const t = useTranslations('settings')
  const tNav = useTranslations('navigation')

  const sectionLabel = (key: string): { title: string; desc: string } => {
    if (key === 'reference_cities') return { title: t('reference_cities.title'), desc: t('reference_cities.desc') }
    if (key === 'reference_positions') return { title: t('reference_positions.title'), desc: t('reference_positions.desc') }
    return { title: t(`tabs.${key}`), desc: t(`${key}.desc`) }
  }

  return (
    <div className="p-6 space-y-6">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title') },
      ]} />
      <ModuleHeader module="settings" title={t('system_title')} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map(s => {
          const lbl = sectionLabel(s.key)
          return (
            <Link key={s.key} href={s.href} className="block group no-underline">
              <div
                className="rounded-xl cursor-pointer"
                style={{
                  padding: 24,
                  background: 'var(--surface)',
                  borderTop: `3px solid ${s.color}`,
                  boxShadow: 'var(--shadow)',
                  transition: 'box-shadow 0.15s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(45,49,112,0.12)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.07)' }}
              >
                <div
                  style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: s.bg, flexShrink: 0, marginBottom: 14 }}
                  className="flex items-center justify-center"
                >
                  <svg style={{ width: 22, height: 22, color: s.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={s.iconPath} />
                  </svg>
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{lbl.title}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{lbl.desc}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
