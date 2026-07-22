'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import SubjectsTab from './SubjectsTab'
import SpecialtiesTab from './SpecialtiesTab'
import StudyGroupsTab from './StudyGroupsTab'
import StudentsTab from './StudentsTab'
import ClassGroupsTab from './ClassGroupsTab'
import StudiesWorkspace from './StudiesWorkspace'
import StudiesDashboard from './StudiesDashboard'

/**
 * Область «Учёба» как единое рабочее пространство. Лёгкий вид (запрос владельца
 * «יותר מידי כפתורים = בלאגן»): чистые линейные иконки вместо эмодзи, мягкое
 * выделение активного пункта (accent-tint + accent-strong, как в главном
 * сайдбаре), и СВОРАЧИВАЕМЫЙ рельс — в узком режиме только иконки, состояние
 * запоминается. Ни один экран не убран: «Дополнительно» сворачивает прежние
 * настроечные разделы, но они в клике.
 */

type Section = 'dashboard' | 'semester_groups' | 'students' | 'class_groups' | 'study_groups' | 'subjects' | 'specialties'

// Основной поток — всегда на виду.
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

// Линейные иконки (Heroicons outline, 24) — единый стиль со всей системой.
const ICON: Record<Section, string> = {
  dashboard: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 8.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  semester_groups: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  students: 'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5',
  class_groups: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  study_groups: 'M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122',
  subjects: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
  specialties: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3zM6 6h.008v.008H6V6z',
}

const STORE_KEY = 'edu_study_rail_collapsed'

export default function StudyTab() {
  const t = useTranslations('education')
  const { isRTL } = useLang()
  const [active, setActive] = useState<Section>('dashboard')

  const advancedActive = ADVANCED.some(s => s.key === active)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const showAdvanced = advancedOpen || advancedActive

  // Свёрнутый рельс (только иконки). Читаем сохранённое состояние после
  // монтирования — чтобы не ловить рассинхрон гидрации.
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    try { if (localStorage.getItem(STORE_KEY) === '1') setCollapsed(true) } catch { /* ignore */ }
  }, [])
  function toggleCollapsed() {
    setCollapsed(v => {
      const next = !v
      try { localStorage.setItem(STORE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  const railItem = (key: Section, label: string, isActive: boolean): React.ReactNode => (
    <div key={key} style={{ position: 'relative' }}>
      {isActive && (
        <span style={{
          position: 'absolute', top: 6, bottom: 6, width: 3, borderRadius: 3,
          background: 'var(--accent)', [isRTL ? 'right' : 'left']: 0,
        }} />
      )}
      <button
        type="button"
        onClick={() => setActive(key)}
        title={collapsed ? label : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 11, width: '100%',
          justifyContent: collapsed ? 'center' : 'flex-start', textAlign: 'start',
          padding: collapsed ? '10px 0' : '9px 11px', borderRadius: 9, fontSize: 13.5,
          fontWeight: isActive ? 600 : 500, cursor: 'pointer', border: 'none',
          fontFamily: 'inherit', whiteSpace: 'nowrap',
          background: isActive ? 'var(--accent-tint)' : 'transparent',
          color: isActive ? 'var(--accent-strong)' : 'var(--text-muted)',
          transition: 'background 0.12s, color 0.12s',
        }}
        onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' } }}
        onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' } }}
      >
        <svg style={{ width: 18, height: 18, flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={ICON[key]} />
        </svg>
        {!collapsed && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
      </button>
    </div>
  )

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `${collapsed ? 60 : 190}px 1fr` }} className="study-ws">
        {/* Боковой рельс */}
        <nav style={{ background: 'var(--surface-2)', borderInlineEnd: '1px solid var(--border)', padding: collapsed ? '10px 8px' : '12px 9px', display: 'flex', flexDirection: 'column', gap: 3 }} className="study-rail">
          {/* Кнопка сворачивания */}
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? t('study.rail.expand') : t('study.rail.collapse')}
            aria-label={collapsed ? t('study.rail.expand') : t('study.rail.collapse')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-end',
              width: '100%', padding: '4px 6px', marginBottom: 4, background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--text-faint)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)' }}
          >
            <svg style={{ width: 17, height: 17, transform: `scaleX(${isRTL ? -1 : 1})` }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9}
                d={collapsed ? 'M8.25 4.5l7.5 7.5-7.5 7.5' : 'M15.75 19.5L8.25 12l7.5-7.5'} />
            </svg>
          </button>

          {railItem('dashboard', t('study.dashboard.title'), active === 'dashboard')}
          {railItem('semester_groups', t('study.tabs.semester_groups'), active === 'semester_groups')}
          {PRIMARY.map(s => railItem(s.key, t(`study.tabs.${s.labelKey}`), active === s.key))}

          {/* «Дополнительно» — сворачиваемая группа прежних экранов настройки. */}
          {collapsed ? (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '6px 4px' }} />
              {ADVANCED.map(s => railItem(s.key, t(`study.tabs.${s.labelKey}`), active === s.key))}
            </>
          ) : (
            <>
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
              {showAdvanced && ADVANCED.map(s => railItem(s.key, t(`study.tabs.${s.labelKey}`), active === s.key))}
            </>
          )}
        </nav>

        {/* Контент */}
        <div style={{ padding: 18, overflowX: 'auto', minWidth: 0 }}>
          {active === 'dashboard' && <StudiesDashboard />}
          {active === 'semester_groups' && <StudiesWorkspace />}
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
