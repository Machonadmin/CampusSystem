'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface MyLesson {
  id: string
  class_group_name: string
  subject: string | null
  scheduled_time: string | null
  topic: string | null
  is_cancelled: boolean
  marked_count: number
  enrolled_count: number
}
interface MyGroup {
  id: string
  name: string
  subject: string | null
  unit: string | null
  is_primary: boolean
  student_count: number
}

const accent = getModuleColor('education')

function hhmm(t: string | null): string {
  if (!t) return ''
  const m = /^(\d{2}):(\d{2})/.exec(t)
  return m ? `${m[1]}:${m[2]}` : t
}

export default function TeacherDashboard() {
  const t = useTranslations('education.study')
  const router = useRouter()
  const [lessons, setLessons] = useState<MyLesson[] | null>(null)
  const [groups, setGroups] = useState<MyGroup[] | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    fetch(`/api/education/my-lessons?date=${today}`)
      .then(r => (r.ok ? r.json() : { lessons: [] }))
      .then(b => setLessons((b.lessons ?? []) as MyLesson[]))
      .catch(() => setLessons([]))
    fetch('/api/education/my-groups')
      .then(r => (r.ok ? r.json() : { groups: [] }))
      .then(b => setGroups((b.groups ?? []) as MyGroup[]))
      .catch(() => setGroups([]))
  }, [today])

  const card: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16,
  }
  const sectionTitle: React.CSSProperties = {
    fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px',
  }
  const empty: React.CSSProperties = {
    padding: 20, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('teacher.title')}</h2>
        <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 3 }}>{t('teacher.subtitle')}</div>
      </div>

      {/* Мои уроки сегодня */}
      <div style={card}>
        <h3 style={sectionTitle}>{t('teacher.lessons_today')}</h3>
        {lessons === null ? (
          <div style={empty}>…</div>
        ) : lessons.length === 0 ? (
          <div style={empty}>{t('teacher.no_lessons')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lessons.map(l => (
              <button
                key={l.id}
                type="button"
                onClick={() => router.push('/dashboard/calendar')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'start',
                  padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)',
                  background: l.is_cancelled ? 'var(--surface-2)' : 'var(--surface)', cursor: 'pointer',
                  opacity: l.is_cancelled ? 0.6 : 1, fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700, color: accent, minWidth: 46 }}>{hhmm(l.scheduled_time) || '—'}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.class_group_name}{l.subject ? ` · ${l.subject}` : ''}
                  </span>
                  {l.topic && (
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.topic}</span>
                  )}
                </span>
                {l.is_cancelled ? (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--danger)', background: 'var(--danger-tint)', padding: '3px 8px', borderRadius: 6 }}>{t('teacher.cancelled')}</span>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {t('teacher.marked').replace('{done}', String(l.marked_count)).replace('{total}', String(l.enrolled_count))}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Мои группы */}
      <div style={card}>
        <h3 style={sectionTitle}>{t('teacher.my_groups')}</h3>
        {groups === null ? (
          <div style={empty}>…</div>
        ) : groups.length === 0 ? (
          <div style={empty}>{t('teacher.no_groups')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {groups.map(g => (
              <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                  {g.is_primary && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: accent, background: 'var(--accent-tint)', padding: '2px 6px', borderRadius: 5, whiteSpace: 'nowrap' }}>{t('teacher.primary')}</span>
                  )}
                </div>
                {(g.subject || g.unit) && (
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[g.subject, g.unit].filter(Boolean).join(' · ')}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  {t('teacher.students_count').replace('{n}', String(g.student_count))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
