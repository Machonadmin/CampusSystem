'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import SubjectsTab from './SubjectsTab'
import SpecialtiesTab from './SpecialtiesTab'
import StudyGroupsTab from './StudyGroupsTab'
import ClassGroupsTab from './ClassGroupsTab'
import BuildingsTab from './BuildingsTab'

// ─── «Настройки учёбы» — редкие настроечные экраны за одним пунктом рельса ────
// Владелец: «יותר מדי כפתורים = אנשים בורחים». Каталоги и настройка структуры
// уходят на уровень глубже; ежедневная работа (панель/семестры/студентки) — на
// виду. Ничего не удалено: всё в один клик.

type Sub = 'subjects' | 'specialties' | 'study_groups' | 'class_groups' | 'buildings'

const ICON: Record<string, string> = {
  subjects: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
  specialties: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3zM6 6h.008v.008H6V6z',
  study_groups: 'M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122',
  class_groups: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  buildings: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21',
  kodesh: 'M12 3v18m0-18l-2.25 2.25M12 3l2.25 2.25M4.5 9.75l1.5 8.25h12l1.5-8.25M3 9.75h18',
  communities: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  import: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5',
}

export default function StudiesSettings() {
  const t = useTranslations('education.study')
  const tEdu = useTranslations('education')
  const router = useRouter()
  const [sub, setSub] = useState<Sub | null>(null)

  const inPlace: { key: Sub; label: string }[] = [
    { key: 'subjects', label: t('tabs.subjects') },
    { key: 'specialties', label: t('tabs.specialties') },
    { key: 'study_groups', label: t('tabs.study_groups') },
    { key: 'class_groups', label: t('tabs.class_groups') },
    { key: 'buildings', label: t('tabs.buildings') },
  ]
  const links: { icon: string; label: string; href: string }[] = [
    { icon: ICON.kodesh, label: tEdu('kodesh.nav'), href: '/dashboard/education/kodesh' },
    { icon: ICON.communities, label: tEdu('communities.nav'), href: '/dashboard/education/communities' },
    { icon: ICON.import, label: tEdu('import.title'), href: '/dashboard/education/students/import' },
  ]

  if (sub) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setSub(null)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 14, padding: 0 }}
        >
          <span style={{ fontSize: 15 }}>‹</span>{t('tabs.settings')}
        </button>
        {sub === 'subjects' && <SubjectsTab />}
        {sub === 'specialties' && <SpecialtiesTab />}
        {sub === 'study_groups' && <StudyGroupsTab />}
        {sub === 'class_groups' && <ClassGroupsTab />}
        {sub === 'buildings' && <BuildingsTab />}
      </div>
    )
  }

  return (
    <div>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--text-faint)' }}>{t('settings_hint')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
        {inPlace.map(item => (
          <SettingCard key={item.key} label={item.label} icon={ICON[item.key]} onClick={() => setSub(item.key)} />
        ))}
        {links.map(l => (
          <SettingCard key={l.href} label={l.label} icon={l.icon} onClick={() => router.push(l.href)} />
        ))}
      </div>
    </div>
  )
}

function SettingCard({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, textAlign: 'start', width: '100%',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '13px 14px', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow)',
        transition: 'border-color 0.12s, transform 0.12s',
      }}
      onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'var(--accent-strong)'; el.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'var(--border)'; el.style.transform = 'translateY(0)' }}
    >
      <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-2)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={icon} /></svg>
      </span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  )
}
