'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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
//
// Решение владельца 11.11.2026: «הגדרות» = постоянные списки, которые задают
// один раз и на которых строится всё остальное. Сюда перенесены из «פעולות»
// מסלולי חול, קורסי יהדות, ימים ללא לימודים; «מעבר שנה» ушёл в «פעולות»
// (подэкран остаётся доступен по старой ссылке ?sub=year_rollover), а
// «קהילות» — в раздел «גיוס» (это откуда приходят кандидатки, не учёба).

type Sub = 'catalogs' | 'groups' | 'buildings' | 'year_rollover'
const SUBS: readonly Sub[] = ['catalogs', 'groups', 'buildings', 'year_rollover']

/** Подэкран из ?sub= (неизвестное/пустое → null = корень настроек). */
function parseSub(raw: string | null): Sub | null {
  return raw != null && (SUBS as readonly string[]).includes(raw) ? (raw as Sub) : null
}

const ICON: Record<string, string> = {
  tracks: 'M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z',
  kodesh_courses: 'M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5',
  catalogs: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
  groups: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z',
  buildings: 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21',
  year_rollover: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008z',
  units: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.75A.75.75 0 019.75 16.5h4.5a.75.75 0 01.75.75V21',
}
ICON.no_lesson_days = ICON.year_rollover

export default function StudiesSettings() {
  const t = useTranslations('education.study')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Открытый подэкран — в URL (?sub=, рядом с ?sec=settings), как разделы рельса
  // в StudyTab: router.push → браузерный «назад» возвращает к корню настроек,
  // а обновление страницы / deep-link открывают тот же подэкран.
  const sub = parseSub(searchParams.get('sub'))
  const setSub = useCallback((next: Sub | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next) params.set('sub', next)
    else params.delete('sub')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }, [router, pathname, searchParams])
  // Внутренний переключатель объединённых карточек.
  const [catalogView, setCatalogView] = useState<'subjects' | 'specialties'>('subjects')
  const [groupsView, setGroupsView] = useState<'study_groups' | 'class_groups'>('study_groups')
  // Доступ к экранам-ссылкам (та же проверка, что у карточек «פעולות»):
  // null = грузим, {} = ошибка → карточки с acc скрыты (fail-closed, иначе 403).
  const [access, setAccess] = useState<Record<string, boolean> | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/education/launcher-access')
      .then(r => (r.ok ? r.json() : {}))
      .then(body => { if (alive) setAccess((body && typeof body === 'object' ? body : {}) as Record<string, boolean>) })
      .catch(() => { if (alive) setAccess({} as Record<string, boolean>) })
    return () => { alive = false }
  }, [])
  const tDash = useTranslations('education.study.dashboard')

  // Порядок карточек — как в утверждённой схеме (11.11.2026).
  type Card = { id: string; label: string; icon: string; onClick: () => void; acc?: string }
  const inPlace = (key: Sub, label: string): Card => ({ id: key, label, icon: ICON[key], onClick: () => setSub(key) })
  const link = (id: string, label: string, href: string, acc?: string): Card =>
    ({ id, label, icon: ICON[id], onClick: () => router.push(href), acc })
  const cards: Card[] = [
    inPlace('catalogs', t('settings_card_catalogs')),
    link('tracks', tDash('launch_track_catalog'), '/dashboard/education/tracks', 'track_catalog'),
    // Без acc: GET class-groups открыт любому вошедшему (как было в «פעולות»).
    link('kodesh_courses', tDash('launch_kodesh_courses'), '/dashboard/education/kodesh-courses'),
    inPlace('groups', t('settings_card_groups')),
    inPlace('buildings', t('tabs.buildings')),
    link('no_lesson_days', tDash('launch_no_lesson_days'), '/dashboard/education/no-lesson-days', 'no_lesson_days'),
    link('units', t('settings_card_units'), '/dashboard/education/units'),
  ].filter(c => !c.acc || access?.[c.acc] === true)

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
        {cards.map(c => (
          <SettingCard key={c.id} label={c.label} icon={c.icon} onClick={c.onClick} />
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
