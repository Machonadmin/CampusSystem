'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import EducationHeaderNav from './components/EducationHeaderNav'
import StudyTab from './components/StudyTab'
import AcceptanceOverviewTab from './components/AcceptanceOverviewTab'
import RecruitmentTab from './components/RecruitmentTab'
import AdmissionTab from './components/AdmissionTab'
import ModuleTabs from '@/components/ui/ModuleTabs'
import PendingSignatures from '@/components/workflow/PendingSignatures'
import { useTranslations } from '@/lib/i18n/LanguageContext'

// ── Страница модуля «Обучение» ──────────────────────────────────────────────
//
// Тонкий контейнер: шапка, хлебные крошки, вкладки. Тяжёлое содержимое каждой
// вкладки вынесено в отдельный компонент (Workstream 3b) — набор, приём,
// комиссия, учёба грузятся и владеют своим состоянием сами.

export default function EducationPage() {
  const router = useRouter()
  const t = useTranslations('education')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const [tab, setTab] = useState<'recruitment' | 'admission' | 'committee' | 'study'>('recruitment')
  // Какие вкладки вправе видеть пользователь (null = ещё грузим). «Каждый видит только своё».
  const [tabAccess, setTabAccess] = useState<Record<string, boolean> | null>(null)

  // «Приём» и «Комиссия» объединены владельцем в один раздел «קבלה» (это и есть
  // доска приёмной комиссии). Три раздела: набор / приём / учёба.
  const TABS = [
    { key: 'recruitment', label: t('tabs.leads') },
    { key: 'committee',   label: t('tabs.applicants') },
    { key: 'study',       label: t('tabs.students') },
  ] as const

  const visibleTabs = TABS.filter(tb => (tabAccess ? tabAccess[tb.key] !== false : true))

  // Загружаем права на вкладки один раз.
  useEffect(() => {
    let alive = true
    fetch('/api/education/tab-access')
      .then(r => (r.ok ? r.json() : null))
      .then(a => { if (alive && a) setTabAccess(a) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // Если активная вкладка недоступна пользователю — переключаемся на первую доступную.
  useEffect(() => {
    if (tabAccess && tabAccess[tab] === false) {
      const first = TABS.find(tb => tabAccess[tb.key] !== false)
      if (first) setTab(first.key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabAccess])

  return (
    <div className="p-6 space-y-5">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600,
            color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border-strong)',
            borderRadius: 8, padding: '6px 13px', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)' }}
        >
          <span style={{ fontSize: 15, lineHeight: 1 }}>›</span>{tCommon('back')}
        </button>
        <Breadcrumb items={[
          { label: tNav('home'), href: '/dashboard' },
          { label: tNav('education') },
        ]} />
      </div>

      <div style={{
        background: getModuleHeaderGradient('education'),
        borderRadius: 12, padding: '11px 22px',
        boxShadow: '0 2px 8px rgba(16,185,129,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <h1 style={{ fontSize: 15.5, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 9, margin: 0 }}>
          <svg style={{ width: 19, height: 19 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
          </svg>{tNav('education')}
        </h1>
        <EducationHeaderNav />
      </div>

      {/* Личная очередь «Ожидают моей подписи» — видна только при наличии */}
      <PendingSignatures />

      {/* Tabs */}
      {visibleTabs.length > 1 && (
        <ModuleTabs
          tabs={visibleTabs.map(tb => ({ key: tb.key, label: tb.label }))}
          active={tab}
          onChange={k => setTab(k as 'recruitment' | 'admission' | 'committee' | 'study')}
          accentColor={getModuleColor('education')}
          variant="underline"
        />
      )}

      {tab === 'recruitment' && <RecruitmentTab />}
      {tab === 'admission' && <AdmissionTab />}
      {tab === 'committee' && <AcceptanceOverviewTab />}
      {tab === 'study' && <StudyTab />}
    </div>
  )
}
