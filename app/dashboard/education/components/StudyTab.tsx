'use client'

import { useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import SubjectsTab from './SubjectsTab'
import SpecialtiesTab from './SpecialtiesTab'
import StudyGroupsTab from './StudyGroupsTab'
import StudentsTab from './StudentsTab'
import ClassGroupsTab from './ClassGroupsTab'
import SemesterGroupsTab from './SemesterGroupsTab'
import StudiesDashboard from './StudiesDashboard'

/**
 * Область «Учёба» как единое рабочее пространство. «Наводим порядок» (фаза 5):
 * основной поток — Панель / Семестры / Студентки. Прежние настроечные экраны
 * (учебные группы, базовые группы, предметы, специализации) НИЧЕГО не потеряли —
 * они свёрнуты под «Дополнительно» и открываются одним кликом.
 */

type Section = 'dashboard' | 'semester_groups' | 'students' | 'class_groups' | 'study_groups' | 'subjects' | 'specialties'

// Основные разделы — всегда на виду.
const PRIMARY: { key: Section; labelKey: string }[] = [
  { key: 'students', labelKey: 'students' },
]

// «Дополнительно» — прежние настроечные экраны, свёрнуты по умолчанию.
const ADVANCED: { key: Section; labelKey: string }[] = [
  { key: 'class_groups', labelKey: 'class_groups' },
  { key: 'study_groups', labelKey: 'study_groups' },
  { key: 'subjects', labelKey: 'subjects' },
  { key: 'specialties', labelKey: 'specialties' },
]

const accent = getModuleColor('education')

export default function StudyTab() {
  const t = useTranslations('education')
  const { isRTL } = useLang()
  const [active, setActive] = useState<Section>('dashboard')

  const advancedActive = ADVANCED.some(s => s.key === active)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const showAdvanced = advancedOpen || advancedActive

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
          {railItem('semester_groups', t('study.tabs.semester_groups'), '🎓', active === 'semester_groups')}
          {PRIMARY.map(s => railItem(s.key, t(`study.tabs.${s.labelKey}`), SETUP_ICON[s.key], active === s.key))}

          {/* «Дополнительно» — сворачиваемая группа прежних экранов настройки. */}
          <button
            type="button"
            onClick={() => setAdvancedOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'start',
              padding: '10px 11px 5px', marginTop: 8, background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
              color: 'var(--text-faint)', textTransform: 'uppercase',
            }}
          >
            <span style={{ fontSize: 9, display: 'inline-block', transition: 'transform 0.15s', transform: `rotate(${showAdvanced ? 90 : (isRTL ? 180 : 0)}deg)` }}>▶</span>
            {t('study.advanced_label')}
          </button>
          {showAdvanced && ADVANCED.map(s => railItem(s.key, t(`study.tabs.${s.labelKey}`), SETUP_ICON[s.key], active === s.key))}
        </nav>

        {/* Контент */}
        <div style={{ padding: 18, overflowX: 'auto', minWidth: 0 }}>
          {active === 'dashboard' && <StudiesDashboard />}
          {active === 'semester_groups' && <SemesterGroupsTab />}
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
        }
      `}</style>
    </div>
  )
}

const SETUP_ICON: Record<Section, string> = {
  dashboard: '📊', semester_groups: '🎓', students: '👩‍🎓', class_groups: '📚', study_groups: '🗂️', subjects: '📖', specialties: '🎯',
}
