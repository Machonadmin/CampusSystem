'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { MODULE_ICON_PATHS } from '@/lib/nav/module-icons'
import KodeshHomeClient from '@/app/dashboard/education/kodesh-home/KodeshHomeClient'

// Экраны, на которые ведёт модуль. Раньше это был отдельный сайдбар главы
// кафедры иудаики; теперь — ссылки внутри самого модуля. Видимость каждой
// ссылки приходит с сервера (/api/education/workspace-nav, fail-closed).
const LINKS = [
  { key: 'prep',       href: '/dashboard/education/kodesh' },
  { key: 'courses',    href: '/dashboard/education/kodesh-courses' },
  { key: 'teachers',   href: '/dashboard/education/teachers' },
  { key: 'students',   href: '/dashboard/education/studies?sec=students' },
  { key: 'calendar',   href: '/dashboard/education/timetable' },
  { key: 'alerts',     href: '/dashboard/education/alerts' },
  { key: 'jewishness', href: '/dashboard/jewishness' },
  { key: 'contacts',   href: '/dashboard/contacts' },
] as const

export default function KodeshSpaceClient() {
  const tNav = useTranslations('navigation')
  const tEdu = useTranslations('education')
  const t = useTranslations('education.kodesh_home')
  const { t: tLang } = useLang()
  const [items, setItems] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let alive = true
    fetch('/api/education/workspace-nav')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d?.items && typeof d.items === 'object') setItems(d.items as Record<string, boolean>) })
      .catch(() => { /* fail-closed: без ссылок */ })
    return () => { alive = false }
  }, [])

  const visible = LINKS.filter(l => items[l.key] === true)

  return (
    <div className="p-6 space-y-5">
      <ModuleHeader
        breadcrumb={[
          { label: tNav('home'), href: '/dashboard' },
          { label: tLang.nav.kodesh_space },
        ]}
        module="education"
        compact
        icon={<svg style={{ width: 19, height: 19, color: 'currentColor' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={MODULE_ICON_PATHS.kodesh_space} />
        </svg>}
        title={tLang.nav.kodesh_space}
        subtitle={t('subtitle')}
      />

      {visible.length > 0 && (
        <nav aria-label={tLang.nav.kodesh_space} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {visible.map(l => (
            <Link
              key={l.key}
              href={l.href}
              style={{
                padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                border: '1px solid var(--border-strong)', background: 'var(--surface)',
                color: 'var(--text)', textDecoration: 'none',
              }}
            >
              {tEdu(`kodesh_nav.${l.key}`)}
            </Link>
          ))}
        </nav>
      )}

      <KodeshHomeClient />
    </div>
  )
}
