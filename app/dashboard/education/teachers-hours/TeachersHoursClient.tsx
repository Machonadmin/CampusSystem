'use client'

import { Fragment, useEffect, useState } from 'react'
import { intlLocale } from '@/lib/i18n/format-date'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { SkeletonRows } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

interface Slot { group_name: string; day_of_week: number; start_time: string; end_time: string; room: string | null }
interface Teacher { person_id: string; name: string; groups_count: number; weekly_hours: number; actual_hours?: number; actual_lessons?: number; actual_no_end_time?: number; slots: Slot[] }

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

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
  const tCommon = useTranslations('common')
  const { lang } = useLang()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  // Месяц факта (YYYY-MM). Факт = подтверждённые секретариатом уроки — та же
  // цифра, что пойдёт в зарплату.
  const [ym, setYm] = useState<string>(currentMonth())
  const [noEndTime, setNoEndTime] = useState(0)

  useEffect(() => {
    let alive = true
    const [y, m] = ym.split('-')
    setLoaded(false); setError(false)
    fetch(`/api/education/teachers-hours?year=${encodeURIComponent(y ?? '')}&month=${encodeURIComponent(String(Number(m ?? '')))}`)
      .then(r => { if (!r.ok) throw new Error('load'); return r.json() })
      .then(d => { if (alive) { setTeachers(d.teachers ?? []); setNoEndTime(Number(d.actual_no_end_time ?? 0)) } })
      .catch(() => { if (alive) setError(true) })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [ym])

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

          <ModuleHeader module="education" title={t('title')} subtitle={t('subtitle')} />
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-muted)' }}>
          {t('month_label')}
          <input type="month" value={ym} onChange={e => { if (e.target.value) setYm(e.target.value) }}
            style={{ fontSize: 13, padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', background: 'var(--surface)' }} />
        </label>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('actual_hint')}</span>
      </div>
      {loaded && !error && noEndTime > 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--warn)', background: 'var(--warn-tint)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
          {t('no_end_time_warning').replace('{n}', String(noEndTime))}
        </div>
      )}

      {!loaded ? (
        <SkeletonRows />
      ) : error ? (
        <div style={{ fontSize: 13, color: 'var(--danger)', padding: 12 }}>{tCommon('load_error')}</div>
      ) : teachers.length === 0 ? (
        <EmptyState text={t('no_data')} />
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
          <table className="cards-sm" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>{t('col_teacher')}</th>
                <th style={th}>{t('col_groups')}</th>
                <th style={th}>{t('col_hours')}</th>
                <th style={th}>{t('col_actual')}</th>
                <th style={{ ...th, textAlign: 'end' }}></th>
              </tr>
            </thead>
            <tbody>
              {teachers.map(tc => {
                const open = openId === tc.person_id
                return (
                  <Fragment key={tc.person_id}>
                    <tr onClick={() => setOpenId(open ? null : tc.person_id)} style={{ cursor: 'pointer' }}>
                      <td style={{ ...td, fontWeight: 600 }} data-label={t('col_teacher')}>{tc.name || '—'}</td>
                      <td style={td} data-label={t('col_groups')}>{tc.groups_count}</td>
                      <td style={td} data-label={t('col_hours')}>
                        <span style={{ fontWeight: 700, color: 'var(--accent-strong)' }}>{tc.weekly_hours}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)', marginInlineStart: 3 }}>{t('hours_short')}</span>
                      </td>
                      <td style={td} data-label={t('col_actual')}>
                        <span style={{ fontWeight: 700, color: 'var(--text)' }}>{tc.actual_hours ?? 0}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)', marginInlineStart: 3 }}>{t('hours_short')}</span>
                        {(tc.actual_no_end_time ?? 0) > 0 && (
                          <span title={t('no_end_time_warning').replace('{n}', String(tc.actual_no_end_time))} style={{ fontSize: 11, color: 'var(--warn)', marginInlineStart: 6 }}>⚠ {tc.actual_no_end_time}</span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'end', color: 'var(--text-faint)' }} data-label="">{tc.slots.length > 0 ? (open ? '▲' : '▼') : ''}</td>
                    </tr>
                    {open && tc.slots.length > 0 && (
                      <tr>
                        <td colSpan={5} data-label="" style={{ padding: '0 14px 12px', background: 'var(--surface-2)' }}>
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
