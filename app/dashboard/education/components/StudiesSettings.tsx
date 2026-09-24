'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import SubjectsTab from './SubjectsTab'
import SpecialtiesTab from './SpecialtiesTab'
import StudyGroupsTab from './StudyGroupsTab'
import ClassGroupsTab from './ClassGroupsTab'
import BuildingsTab from './BuildingsTab'
import YearRolloverTab from './YearRolloverTab'

// ─── «Настройки учёбы» — минимум карточек (owner: «מצידי 5 זה הרבה») ─────────
// Родственные каталоги объединены в одну карточку с внутренним переключателем:
//   • «מקצועות והתמחויות» = SubjectsTab + SpecialtiesTab;
//   • «קבוצות» = StudyGroupsTab (базовые) + ClassGroupsTab (учебные);
//   • «יחידות ומבנה» → страница юнитов (кнопка «מבנה» — там, в шапке).
// Убраны дубли: «שיבוץ קודש» (есть в «פעולות»), «ייבוא תלמידות» (кнопка в
// табе «Студентки»), отдельная карточка «מבנה יחידות» (внутри юнитов).
// Ничего не удалено из системы — только сведено.

type Sub = 'catalogs' | 'groups' | 'buildings' | 'year_rollover'

const ICON: Record<string, string> = {
  catalogs: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
  groups: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  buildings: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21',
  year_rollover: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008z',
  units: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.75A.75.75 0 019.75 16.5h4.5a.75.75 0 01.75.75V21',
  communities: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
}

export default function StudiesSettings() {
  const t = useTranslations('education.study')
  const tEdu = useTranslations('education')
  const router = useRouter()
  const [sub, setSub] = useState<Sub | null>(null)
  // Внутренний переключатель объединённых карточек.
  const [catalogView, setCatalogView] = useState<'subjects' | 'specialties'>('subjects')
  const [groupsView, setGroupsView] = useState<'study_groups' | 'class_groups'>('study_groups')

  const inPlace: { key: Sub; label: string }[] = [
    { key: 'catalogs', label: t('settings_card_catalogs') },
    { key: 'groups', label: t('settings_card_groups') },
    { key: 'buildings', label: t('tabs.buildings') },
    { key: 'year_rollover', label: t('rollover.tab') },
  ]
  const links: { icon: string; label: string; href: string }[] = [
    { icon: ICON.units, label: t('settings_card_units'), href: '/dashboard/education/units' },
    { icon: ICON.communities, label: tEdu('communities.nav'), href: '/dashboard/education/communities' },
  ]

  const toggleBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 7, cursor: 'pointer',
    fontFamily: 'inherit', border: `1px solid ${active ? 'var(--accent-strong)' : 'var(--border-strong)'}`,
    background: active ? 'var(--accent-tint)' : 'var(--surface)',
    color: active ? 'var(--accent-strong)' : 'var(--text-muted)',
  })

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
        {sub === 'catalogs' && (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <button type="button" onClick={() => setCatalogView('subjects')} style={toggleBtn(catalogView === 'subjects')}>{t('tabs.subjects')}</button>
              <button type="button" onClick={() => setCatalogView('specialties')} style={toggleBtn(catalogView === 'specialties')}>{t('tabs.specialties')}</button>
            </div>
            {catalogView === 'subjects' ? <SubjectsTab /> : <SpecialtiesTab />}
          </div>
        )}
        {sub === 'groups' && (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <button type="button" onClick={() => setGroupsView('study_groups')} style={toggleBtn(groupsView === 'study_groups')}>{t('tabs.study_groups')}</button>
              <button type="button" onClick={() => setGroupsView('class_groups')} style={toggleBtn(groupsView === 'class_groups')}>{t('tabs.class_groups')}</button>
            </div>
            {groupsView === 'study_groups' ? <StudyGroupsTab /> : <ClassGroupsTab />}
          </div>
        )}
        {sub === 'buildings' && <BuildingsTab />}
        {sub === 'year_rollover' && <YearRolloverTab />}
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
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
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
