'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import StudentsTab from './StudentsTab'
import StudiesWorkspace from './StudiesWorkspace'
import StudiesSettings from './StudiesSettings'
import StudiesDashboard from './StudiesDashboard'

/**
 * Область «Учёба» как единое рабочее пространство. Лёгкий вид (запрос владельца
 * «יותר מדי כפתורים = אנשים בורחים»): рельс сведён к 4 пунктам — только ежедневная
 * работа (панель / семестры / студентки) + один пункт «⚙ Настройки учёбы», куда
 * ушли редкие настроечные экраны (предметы, специализации, базовые/учебные группы,
 * здания) и редкие действия. Ничего не удалено — всё в один клик. Рельс
 * сворачивается в иконки; состояние запоминается.
 */

type Section = 'dashboard' | 'semester_groups' | 'students' | 'settings'

const RAIL: { key: Section; labelKey: string }[] = [
  { key: 'semester_groups', labelKey: 'study.tabs.semester_groups' },
  { key: 'students', labelKey: 'study.tabs.students' },
  { key: 'settings', labelKey: 'study.tabs.settings' },
]

// Линейные иконки (Heroicons outline) — единый стиль со всей системой.
const ICON: Record<Section, string> = {
  dashboard: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 8.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  semester_groups: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  students: 'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5',
  settings: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
}

const STORE_KEY = 'edu_study_rail_collapsed'

export default function StudyTab() {
  const t = useTranslations('education')
  const { isRTL } = useLang()
  const [active, setActive] = useState<Section>('dashboard')

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

  const railItem = (key: Section, label: string): React.ReactNode => {
    const isActive = active === key
    return (
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
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `${collapsed ? 60 : 190}px 1fr` }} className="study-ws">
        {/* Боковой рельс — 4 пункта */}
        <nav style={{ background: 'var(--surface-2)', borderInlineEnd: '1px solid var(--border)', padding: collapsed ? '10px 8px' : '12px 9px', display: 'flex', flexDirection: 'column', gap: 3 }} className="study-rail">
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

          {railItem('dashboard', t('study.dashboard.title'))}
          {RAIL.map(s => railItem(s.key, t(s.labelKey)))}
        </nav>

        {/* Контент */}
        <div style={{ padding: 18, overflowX: 'auto', minWidth: 0 }}>
          {active === 'dashboard' && <StudiesDashboard />}
          {active === 'semester_groups' && <StudiesWorkspace />}
          {active === 'students' && <StudentsTab />}
          {active === 'settings' && <StudiesSettings />}
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
