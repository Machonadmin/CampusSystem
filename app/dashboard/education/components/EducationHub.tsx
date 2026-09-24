'use client'

import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { EDUCATION_SECTION_ROUTES, type EducationSection } from '@/lib/education/education-hub'

/**
 * Хаб «חינוך» с ВЫБОРОМ (а не авто-редиректом). Показывает карточку на каждый
 * доступный пользователю раздел (набор / приём / учёба). Разделы приходят с
 * сервера уже с учётом прав (fail-closed); одиночный раздел сюда не доходит —
 * сервер уводит прямо в него. Хлебная крошка «חינוך» теперь всегда ведёт на
 * этот стабильный экран, без сюрприза «попал на קבלה/главную».
 */

// section → ключ подписи (education.tabs.*) и иконка (Heroicons outline).
const SECTION_META: Record<EducationSection, { labelKey: string; descKey: string; icon: string }> = {
  recruitment: {
    labelKey: 'tabs.leads',
    descKey: 'hub.desc_recruitment',
    icon: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  },
  admission: {
    labelKey: 'tabs.applicants',
    descKey: 'hub.desc_admission',
    icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  studies: {
    labelKey: 'tabs.students',
    descKey: 'hub.desc_studies',
    icon: 'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5',
  },
}

export default function EducationHub({ sections }: { sections: EducationSection[] }) {
  const t = useTranslations('education')
  const tNav = useTranslations('navigation')

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education') },
      ]} />

      <ModuleHeader module="education" title={t('hub.title')} subtitle={t('hub.subtitle')} />

      <div data-testid="edu-hub" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {sections.map(s => {
          const meta = SECTION_META[s]
          return (
            <Link
              key={s}
              data-testid={`edu-hub-card-${s}`}
              href={EDUCATION_SECTION_ROUTES[s]}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
                padding: '18px 18px', boxShadow: 'var(--shadow)',
              }}
            >
              <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-tint)', color: 'var(--accent-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg style={{ width: 23, height: 23 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={meta.icon} />
                </svg>
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, color: 'var(--text)' }}>{t(meta.labelKey)}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>{t(meta.descKey)}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
