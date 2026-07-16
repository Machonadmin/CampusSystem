'use client'

import { useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import SubjectsTab from './SubjectsTab'
import SpecialtiesTab from './SpecialtiesTab'
import StudyGroupsTab from './StudyGroupsTab'
import StudentsTab from './StudentsTab'
import ClassGroupsTab from './ClassGroupsTab'
import StudiesDashboard from './StudiesDashboard'

/**
 * Область «Учёба» как единое рабочее пространство (макет владельца, вариант «ב»):
 * слева — приборная панель и разделы настройки в одном боковом меню (было — двойная
 * вложенность: вкладки модуля → под-вкладки). «Наводим порядок»: один рельс, один
 * контентный поток. Разделы настройки — те же компоненты, ничего не потеряно.
 */

type Section = 'dashboard' | 'students' | 'class_groups' | 'study_groups' | 'subjects' | 'specialties'

// Разделы настройки (существующие под-вкладки) — второй группой рельса.
const SETUP: { key: Section; labelKey: string }[] = [
  { key: 'students', labelKey: 'students' },
  { key: 'class_groups', labelKey: 'class_groups' },
  { key: 'study_groups', labelKey: 'study_groups' },
  { key: 'subjects', labelKey: 'subjects' },
  { key: 'specialties', labelKey: 'specialties' },
]

const accent = getModuleColor('education')

export default function StudyTab() {
  const t = useTranslations('education')
  const [active, setActive] = useState<Section>('dashboard')

  const railItem = (key: Section, label: string, icon: string, isActive: boolean): React.ReactNode => (
    <button
      key={key}
      type="button"
      onClick={() => setActive(key)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'start',
        padding: '9px 11px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        border: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap',
        background: isActive ? accent : 'transparent',
        color: isActive ? '#fff' : 'var(--text-muted)',
        boxShadow: isActive ? '0 3px 10px rgba(16,185,129,0.25)' : 'none',
      }}
      onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' } }}
      onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' } }}
    >
      <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>{icon}</span>{label}
    </button>
  )

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '186px 1fr' }} className="study-ws">
        {/* Боковой рельс */}
        <nav style={{ background: 'var(--surface-2)', borderInlineEnd: '1px solid var(--border)', padding: '12px 9px', display: 'flex', flexDirection: 'column', gap: 3 }} className="study-rail">
          {railItem('dashboard', t('study.dashboard.title'), '📊', active === 'dashboard')}

          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-faint)', padding: '14px 11px 5px', textTransform: 'uppercase' }}>
            {t('study.setup_label')}
          </div>
          {SETUP.map(s => railItem(s.key, t(`study.tabs.${s.labelKey}`), SETUP_ICON[s.key], active === s.key))}
        </nav>

        {/* Контент */}
        <div style={{ padding: 18, overflowX: 'auto', minWidth: 0 }}>
          {active === 'dashboard' && <StudiesDashboard />}
          {active === 'students' && <StudentsTab />}
          {active === 'class_groups' && <ClassGroupsTab />}
          {active === 'study_groups' && <StudyGroupsTab />}
          {active === 'subjects' && <SubjectsTab />}
          {active === 'specialties' && <SpecialtiesTab />}
        </div>
      </div>

      <style>{`
        @media (max-width: 680px){
          .study-ws{ grid-template-columns: 1fr !important; }
          .study-rail{ flex-direction: row !important; overflow-x: auto; border-inline-end: 0 !important; border-bottom: 1px solid var(--border); }
          .study-rail > div{ display: none; }
        }
      `}</style>
    </div>
  )
}

const SETUP_ICON: Record<Section, string> = {
  dashboard: '📊', students: '👩‍🎓', class_groups: '📚', study_groups: '🗂️', subjects: '📖', specialties: '🎯',
}
