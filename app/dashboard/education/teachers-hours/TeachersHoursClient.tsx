'use client'

import { Fragment, useEffect, useState } from 'react'
import { intlLocale } from '@/lib/i18n/format-date'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { SkeletonRows } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

interface Slot { group_name: string; day_of_week: number; start_time: string; end_time: string; room: string | null }
interface Teacher { person_id: string; name: string; groups_count: number; weekly_hours: number; slots: Slot[] }

// ISO day_of_week (1=Пн..7=Вс) → локализованное имя дня (через Intl, без таблиц).
function dayName(lang: string, iso: number): string {
  const loc = intlLocale(lang)
  // 2024-01-01 — понедельник (ISO 1). iso 1..7 → +(iso-1) дней.
  const d = new Date(Date.UTC(2024, 0, 1 + (iso - 1)))
  return d.toLocaleDateString(loc, { weekday: 'short', timeZone: 'UTC' })
}

// embedded=true — рендер внутри объединённой страницы «מורים» (без хлебных
// крошек и своего заголовка: они у обёртки TeachersClient).
export default function TeachersHoursClient({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useTranslations('education.teachers_hours')
  const tNav = useTranslations('navigation')
  const { lang } = useLang()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loaded, setLoaded] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/education/teachers-hours')
      .then(r => r.ok ? r.json() : { teachers: [] })
      .then(d => { if (alive) setTeachers(d.teachers ?? []) })
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])

  const th: React.CSSProperties = { textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { fontSize: 13, color: 'var(--text)', padding: '11px 14px', borderBottom: '1px solid var(--surface-2)' }

  return (
    <div className={embedded ? 'space-y-5' : 'p-6 space-y-5'}>
      {!embedded && (
        <>
          <Breadcrumb items={[
            { label: tNav('home'), href: '/dashboard' },
            { label: tNav('education'), href: '/dashboard/education' },
            { label: t('title') },
          ]} />

          <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '16px 24px', color: '#fff', boxShadow: '0 2px 8px rgba(16,185,129,0.15)' }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{t('subtitle')}</div>
          </div>
        </>
      )}

      {!loaded ? (
        <SkeletonRows />
      ) : teachers.length === 0 ? (
        <EmptyState text={t('no_data')} />
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{t('col_teacher')}</th>
                <th style={th}>{t('col_groups')}</th>
                <th style={th}>{t('col_hours')}</th>
                <th style={{ ...th, textAlign: 'end' }}></th>
              </tr>
            </thead>
            <tbody>
              {teachers.map(tc => {
                const open = openId === tc.person_id
                return (
                  <Fragment key={tc.person_id}>
                    <tr onClick={() => setOpenId(open ? null : tc.person_id)} style={{ cursor: 'pointer' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{tc.name || '—'}</td>
                      <td style={td}>{tc.groups_count}</td>
                      <td style={td}>
                        <span style={{ fontWeight: 700, color: 'var(--accent-strong)' }}>{tc.weekly_hours}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)', marginInlineStart: 3 }}>{t('hours_short')}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'end', color: 'var(--text-faint)' }}>{tc.slots.length > 0 ? (open ? '▲' : '▼') : ''}</td>
                    </tr>
                    {open && tc.slots.length > 0 && (
                      <tr>
                        <td colSpan={4} style={{ padding: '0 14px 12px', background: 'var(--surface-2)' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 0 6px' }}>{t('schedule')}</div>
                          <div style={{ display: 'grid', gap: 5 }}>
                            {tc.slots.map((s, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                                <span style={{ minWidth: 34, fontWeight: 700, color: 'var(--accent-strong)' }}>{dayName(lang, s.day_of_week)}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', minWidth: 92 }}>{s.start_time}–{s.end_time}</span>
                                <span style={{ flex: 1, color: 'var(--text)' }}>{s.group_name}</span>
                                {s.room && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('room')}: {s.room}</span>}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
