'use client'

import Link from 'next/link'
import { useLang } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'

const SECTIONS = [
  {
    key: 'users',
    href: '/dashboard/settings/users',
    iconPath: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
    bg: '#E6F1FB', color: '#2563EB',
  },
  {
    key: 'roles',
    href: '/dashboard/settings/roles',
    iconPath: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    bg: '#EEEDFE', color: '#7C3AED',
  },
  {
    key: 'departments',
    href: '/dashboard/settings/departments',
    iconPath: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z',
    bg: '#EAF3DE', color: '#16A34A',
  },
  {
    key: 'reference_cities',
    href: '/dashboard/settings/reference-cities',
    iconPath: 'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418',
    bg: '#DBEAFE', color: '#2563EB',
  },
]

const LABELS: Record<string, Record<string, { title: string; desc: string }>> = {
  ru: {
    users: { title: 'Пользователи', desc: 'Управление учётными записями и назначение ролей' },
    roles: { title: 'Роли и привилегии', desc: 'Настройка ролей и прав доступа к модулям' },
    departments:        { title: 'Структура организации', desc: 'Управление подразделениями и отделами' },
    reference_cities:   { title: 'Справочник городов', desc: 'Управление списком городов по странам' },
  },
  he: {
    users:             { title: 'משתמשים', desc: 'ניהול חשבונות והקצאת תפקידים' },
    roles:             { title: 'תפקידים והרשאות', desc: 'הגדרת תפקידים וזכויות גישה למודולים' },
    departments:       { title: 'מבנה ארגוני', desc: 'ניהול מחלקות ויחידות' },
    reference_cities:  { title: 'מדריך ערים', desc: 'ניהול רשימת ערים לפי מדינה' },
  },
  en: {
    users:             { title: 'Users', desc: 'Manage accounts and assign roles' },
    roles:             { title: 'Roles & Privileges', desc: 'Configure roles and module access rights' },
    departments:       { title: 'Organization Structure', desc: 'Manage departments and units' },
    reference_cities:  { title: 'Cities Reference', desc: 'Manage list of cities by country' },
  },
}

const PAGE_TITLE: Record<string, string> = {
  ru: 'Настройки системы',
  he: 'הגדרות מערכת',
  en: 'System Settings',
}

export default function SettingsPage() {
  const { lang } = useLang()
  const labels = LABELS[lang] ?? LABELS.ru

  const homeLabel = lang === 'he' ? 'ראשי' : lang === 'en' ? 'Home' : 'Главная'
  const settingsLabel = lang === 'he' ? 'הגדרות' : lang === 'en' ? 'Settings' : 'Настройки'

  return (
    <div className="p-6 space-y-6">
      <Breadcrumb items={[
        { label: homeLabel, href: '/dashboard' },
        { label: settingsLabel },
      ]} />
      <div
        className="flex items-center rounded-xl overflow-hidden"
        style={{
          background: getModuleHeaderGradient('settings'),
          padding: '12px 24px',
          boxShadow: '0 2px 8px rgba(30,64,175,0.2)',
        }}
      >
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF' }}>
          {PAGE_TITLE[lang] ?? PAGE_TITLE.ru}
        </h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map(s => {
          const lbl = labels[s.key]
          return (
            <Link key={s.key} href={s.href} className="block group no-underline">
              <div
                className="bg-white rounded-xl cursor-pointer"
                style={{
                  padding: 24,
                  borderTop: `3px solid ${s.color}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                  transition: 'box-shadow 0.15s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(45,49,112,0.12)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.07)' }}
              >
                <div
                  style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: s.bg, flexShrink: 0, marginBottom: 14 }}
                  className="flex items-center justify-center"
                >
                  <svg style={{ width: 22, height: 22, color: s.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={s.iconPath} />
                  </svg>
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#1F2937', marginBottom: 4 }}>{lbl?.title}</p>
                <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>{lbl?.desc}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
