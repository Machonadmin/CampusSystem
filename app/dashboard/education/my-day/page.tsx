'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import AttendancePanel from '@/app/dashboard/education/components/AttendancePanel'
import type { LessonItem } from '@/app/dashboard/education/components/LessonsJournalTab'

interface MyLesson {
  id: string
  class_group_id: string
  class_group_name: string
  subject: string | null
  unit: string | null
  scheduled_date: string
  scheduled_time: string | null
  scheduled_end_time: string | null
  topic: string | null
  description: string | null
  location: string | null
  is_cancelled: boolean
  marked_count: number
  present_count: number
  late_count: number
  absent_count: number
  enrolled_count: number
}

function todayISO() { return new Date().toISOString().slice(0, 10) }
function shiftISO(iso: string, days: number) {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10)
}
function hhmm(t: string | null) { return t ? t.slice(0, 5) : null }

export default function MyDayPage() {
  const t = useTranslations('education.my_day')
  const tAtt = useTranslations('education.attendance')
  const tNav = useTranslations('navigation')
  const accent = getModuleColor('education')

  const [date, setDate] = useState(todayISO())
  const [lessons, setLessons] = useState<MyLesson[]>([])
  const [loading, setLoading] = useState(true)
  const [openLesson, setOpenLesson] = useState<MyLesson | null>(null)

  const load = useCallback(async (d: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/education/my-lessons?date=${d}`)
      if (res.ok) { const b = await res.json(); setLessons(b.lessons ?? []) }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(date) }, [date, load])

  const prettyDate = (() => {
    try { return new Date(date + 'T00:00:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }) }
    catch { return date }
  })()

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '12px 24px' }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{t('title')}</h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{t('subtitle')}</p>
      </div>

      {/* Date nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setDate(shiftISO(date, -1))} style={navBtn}>‹</button>
        <button onClick={() => setDate(todayISO())} style={{ ...navBtn, width: 'auto', padding: '0 14px', fontWeight: 600, color: date === todayISO() ? 'var(--accent-contrast)' : 'var(--text)', background: date === todayISO() ? accent : 'var(--surface)' }}>{t('today')}</button>
        <button onClick={() => setDate(shiftISO(date, 1))} style={navBtn}>›</button>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{prettyDate}</span>
        <input type="date" value={date} onChange={e => setDate(e.target.value || todayISO())}
          style={{ marginInlineStart: 'auto', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }} />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>…</div>
      ) : lessons.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('no_lessons')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {lessons.map(l => {
            const done = l.marked_count
            const total = l.enrolled_count
            return (
              <div key={l.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)', opacity: l.is_cancelled ? 0.6 : 1, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* time block */}
                <div style={{ minWidth: 62, textAlign: 'center' }}>
                  <div className="mono" style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{hhmm(l.scheduled_time) ?? '—'}</div>
                  {l.scheduled_end_time && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>{hhmm(l.scheduled_end_time)}</div>}
                </div>
                <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
                {/* main */}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{l.class_group_name}{l.subject ? ` · ${l.subject}` : ''}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    {l.unit && <span>{l.unit}</span>}
                    {l.location && <span> · {t('location')}: {l.location}</span>}
                    {l.topic && <span> · {l.topic}</span>}
                  </div>
                </div>
                {/* status + action */}
                {l.is_cancelled ? (
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)' }}>{t('cancelled')}</span>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {done === 0 ? (
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)' }}>{t('not_marked')}</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, fontWeight: 600 }}>
                        {l.present_count > 0 && <span style={{ color: 'var(--success)' }} title={tAtt('present')}>✓ {l.present_count}</span>}
                        {l.late_count > 0 && <span style={{ color: 'var(--warn)' }} title={tAtt('late')}>⏱ {l.late_count}</span>}
                        {l.absent_count > 0 && <span style={{ color: 'var(--danger)' }} title={tAtt('absent')}>✕ {l.absent_count}</span>}
                        {done < total && <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>· {total - done} {tAtt('unmarked')}</span>}
                      </div>
                    )}
                    <button onClick={() => setOpenLesson(l)}
                      style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: accent, border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer' }}>
                      {t('mark')}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {openLesson && (
        <AttendancePanel
          lesson={{
            id: openLesson.id,
            class_group_id: openLesson.class_group_id,
            scheduled_date: openLesson.scheduled_date,
            scheduled_time: openLesson.scheduled_time,
            topic: openLesson.topic,
            description: openLesson.description,
            location: openLesson.location,
            is_cancelled: openLesson.is_cancelled,
            marked_count: openLesson.marked_count,
          } as LessonItem}
          canMarkAttendance
          accentColor={accent}
          onClose={() => setOpenLesson(null)}
          onSaved={() => { setOpenLesson(null); load(date) }}
        />
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border-strong)',
  background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontSize: 18, lineHeight: 1,
}
