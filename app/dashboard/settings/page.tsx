'use client'

import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { useMe } from '@/lib/hooks/useMe'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'

// «משתמשים וגישה» и «רשימת תפקידים» переехали в объединённый хаб «צוות»
// (вкладки users / positions) — здесь их больше нет, чтобы не дублировать.
//
// «תפקידים והרשאות» (матрица роль → права) удалён по решению владельца вместе с
// окном личных прав: единственный экран прав в системе — «אבטחת מידע». Права,
// уже выданные ролям, продолжают действовать; менять их экраном больше нельзя.
//
// «רשימת ערים» удалён по решению владельца (2026-09-24): город — обычное поле
// ввода текста (см. CitySelect), справочник не ведётся.
const SECTIONS = [
  {
    key: 'audit',
    href: '/dashboard/settings/audit',
    iconPath: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
    bg: 'var(--surface-2)', color: 'var(--text-muted)',
    // Журнал изменений отдаёт полные old/new чувствительных таблиц — только superadmin
    // (тот же гейт, что на экране и в API). fail-closed: пока роли не загружены — скрыт.
    superadminOnly: true,
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
  const me = useMe()
  const isSuperadmin = !!me?.roles?.includes('superadmin')
  const sections = SECTIONS.filter(s => !('superadminOnly' in s && s.superadminOnly) || isSuperadmin)

  const sectionLabel = (key: string): { title: string; desc: string } => {
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
        {sections.map(s => {
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
