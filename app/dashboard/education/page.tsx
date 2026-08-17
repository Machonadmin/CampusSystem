'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import EducationHeaderNav from './components/EducationHeaderNav'
import StudyTab from './components/StudyTab'
import AcceptanceOverviewTab from './components/AcceptanceOverviewTab'
import RecruitmentTab from './components/RecruitmentTab'
import AdmissionTab from './components/AdmissionTab'
import { useTranslations } from '@/lib/i18n/LanguageContext'

// ── Страница модуля «Обучение» ──────────────────────────────────────────────
//
// Тонкий контейнер: шапка, хлебные крошки, вкладки. Тяжёлое содержимое каждой
// вкладки вынесено в отдельный компонент (Workstream 3b) — набор, приём,
// комиссия, учёба грузятся и владеют своим состоянием сами.

export default function EducationPage() {
  const t = useTranslations('education')
  const tNav = useTranslations('navigation')

  const searchParams = useSearchParams()
  // Начальная вкладка из ?tab= (три пункта сайдбара: набор/приём/учёба).
  const initialTab = ((): 'recruitment' | 'admission' | 'committee' | 'study' => {
    const q = searchParams.get('tab')
    return q === 'committee' || q === 'study' || q === 'admission' || q === 'recruitment' ? q : 'recruitment'
  })()
  const [tab, setTab] = useState<'recruitment' | 'admission' | 'committee' | 'study'>(initialTab)

  // Синхронизация при клике по другому пункту сайдбара (?tab= меняется, страница
  // не перемонтируется).
  useEffect(() => {
    const q = searchParams.get('tab')
    if (q === 'committee' || q === 'study' || q === 'admission' || q === 'recruitment') setTab(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])
  // Какие вкладки вправе видеть пользователь (null = ещё грузим). «Каждый видит только своё».
  const [tabAccess, setTabAccess] = useState<Record<string, boolean> | null>(null)

  // «Приём» и «Комиссия» объединены владельцем в один раздел «קבלה» (это и есть
  // доска приёмной комиссии). Три раздела: набор / приём / учёба.
  const TABS = [
    { key: 'recruitment', label: t('tabs.leads') },
    { key: 'committee',   label: t('tabs.applicants') },
    { key: 'study',       label: t('tabs.students') },
  ] as const

  // Название текущего раздела — для заголовка и хлебных крошек (переключение
  // теперь через сайдбар, а не внутренние вкладки).
  const sectionLabel = TABS.find(tb => tb.key === tab)?.label ?? tNav('education')

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
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: sectionLabel },
      ]} />

      <div style={{
        background: getModuleHeaderGradient('education'),
        borderRadius: 12, padding: '11px 22px',
        boxShadow: '0 2px 8px rgba(16,185,129,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <h1 style={{ fontSize: 15.5, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 9, margin: 0 }}>
          <svg style={{ width: 19, height: 19 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
          </svg>{sectionLabel}
        </h1>
        <EducationHeaderNav />
      </div>

      {/* Внутренние вкладки убраны (п. ב): переключение набор/приём/учёба теперь
          через три пункта сайдбара — дублировать их здесь незачем. Раздел задаёт
          ?tab= (см. выше), visibleTabs оставлен для гейта доступа. */}
      {tab === 'recruitment' && <RecruitmentTab />}
      {tab === 'admission' && <AdmissionTab />}
      {tab === 'committee' && <AcceptanceOverviewTab />}
      {tab === 'study' && <StudyTab />}
    </div>
  )
}
