'use client'

import { useCallback, useEffect, useState } from 'react'
import { intlLocale } from '@/lib/i18n/format-date'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { SubmitButton } from '@/components/ui/SubmitButton'

interface LessonRow {
  lesson_id: string
  date: string | null
  time: string | null
  group_name: string
  subject: string | null
  attendance_id: string | null
  status: string | null
  /** Урок не моей группы — я замещала (отметила посещаемость учениц). */
  substitute?: boolean
}
interface PendingRow {
  id: string
  lesson_id: string
  teacher_person_id: string
  teacher_name: string
  status: string
  note: string | null
  reported_at: string | null
  /** Виртуальная заявка «через посещаемость учениц» — строки отметки ещё нет. */
  virtual?: boolean
  via_student_attendance?: boolean
  two_teachers?: boolean
  lesson: { date: string | null; time: string | null; group_name: string; subject: string | null } | null
}

function fmtDate(lang: string, iso: string | null): string {
  if (!iso) return '—'
  const loc = intlLocale(lang)
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString(loc, { day: '2-digit', month: 'short', weekday: 'short' })
}

// embedded=true — рендер внутри объединённой страницы «מורים» (без хлебных
// крошек и своего заголовка: они у обёртки TeachersClient).
export default function TeacherAttendanceClient({ canApprove, embedded = false }: { canApprove: boolean; embedded?: boolean }) {
  const t = useTranslations('education.teacher_attendance')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const { lang } = useLang()

  const [lessons, setLessons] = useState<LessonRow[]>([])
  const [pending, setPending] = useState<PendingRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const reqs: Promise<void>[] = []
    reqs.push(fetch('/api/education/teacher-attendance?scope=lessons')
      .then(r => { if (!r.ok) throw new Error(); return r.json() }).then(d => { setLessons(d.items ?? []) }).catch(() => { toast(tCommon('load_error'), 'error') }))
    if (canApprove) {
      reqs.push(fetch('/api/education/teacher-attendance?scope=pending')
        .then(r => { if (!r.ok) throw new Error(); return r.json() }).then(d => { setPending(d.items ?? []) }).catch(() => { toast(tCommon('load_error'), 'error') }))
    }
    await Promise.all(reqs)
    setLoaded(true)
  }, [canApprove, tCommon])

  useEffect(() => { load() }, [load])

  async function report(lessonId: string) {
    setBusy(lessonId)
    try {
      await fetch('/api/education/teacher-attendance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lesson_id: lessonId }),
      })
      await load()
    } finally { setBusy(null) }
  }

  async function decide(p: PendingRow, decision: 'approved' | 'rejected') {
    setBusy(p.id)
    try {
      const res = p.virtual
        // Виртуальная заявка: решение создаёт отметку на того, кто отметил посещаемость.
        ? await fetch('/api/education/teacher-attendance/from-attendance', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lesson_id: p.lesson_id, teacher_person_id: p.teacher_person_id, decision }),
        })
        : await fetch(`/api/education/teacher-attendance/${p.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }),
        })
      if (!res.ok) toast(tCommon('load_error'), 'error')
      await load()
    } finally { setBusy(null) }
  }

  const flag = (text: string, tone: 'warn' | 'info') => (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', marginInlineStart: 6,
      background: tone === 'warn' ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)',
      color: tone === 'warn' ? 'var(--danger)' : 'var(--accent-strong)',
    }}>{text}</span>
  )

  const statusChip = (status: string | null) => {
    if (!status) return null
    const map: Record<string, { bg: string; fg: string; key: string }> = {
      reported: { bg: 'rgba(234,179,8,0.14)', fg: 'var(--warn)', key: 'status_reported' },
      approved: { bg: 'rgba(16,185,129,0.14)', fg: 'var(--success)', key: 'status_approved' },
      rejected: { bg: 'rgba(239,68,68,0.14)', fg: 'var(--danger)', key: 'status_rejected' },
    }
    const s = map[status]
    if (!s) return null
    return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>{t(s.key)}</span>
  }

  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }
  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderBottom: '1px solid var(--surface-2)', flexWrap: 'wrap' }

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

      {!loaded ? (
        <SkeletonRows />
      ) : (
        <>
          {/* Секретариат: очередь на подтверждение */}
          {canApprove && (
            <div style={card}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{t('pending_title')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>{t('pending_hint')}</div>
              {pending.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: '8px 0' }}>{t('pending_empty')}</div>
              ) : pending.map(p => (
                <div key={p.id} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                      {p.teacher_name || '—'}
                      {p.two_teachers && flag(t('flag_two_teachers'), 'warn')}
                      {p.via_student_attendance && flag(t('flag_via_student_attendance'), 'info')}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {fmtDate(lang, p.lesson?.date ?? null)}{p.lesson?.time ? ` · ${p.lesson.time}` : ''}
                      {p.lesson?.subject ? ` · ${p.lesson.subject}` : ''}{p.lesson?.group_name ? ` · ${p.lesson.group_name}` : ''}
                    </div>
                  </div>
                  <SubmitButton onClick={() => decide(p, 'approved')} loading={busy === p.id}
                    style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--success)', color: '#fff', opacity: busy === p.id ? 0.6 : 1 }}>
                    {t('approve')}
                  </SubmitButton>
                  <SubmitButton onClick={() => decide(p, 'rejected')} loading={busy === p.id}
                    style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--surface)', color: 'var(--text-muted)', opacity: busy === p.id ? 0.6 : 1 }}>
                    {t('reject')}
                  </SubmitButton>
                </div>
              ))}
            </div>
          )}

          {/* Учитель: мои уроки + отметка */}
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{t('my_lessons_title')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10 }}>{t('my_lessons_hint')}</div>
            {lessons.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: '8px 0' }}>{t('my_lessons_empty')}</div>
            ) : lessons.map(l => (
              <div key={l.lesson_id} style={rowStyle}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                    {l.subject || l.group_name || '—'}
                    {l.substitute && flag(t('flag_substitute'), 'info')}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {fmtDate(lang, l.date)}{l.time ? ` · ${l.time}` : ''}{l.subject && l.group_name ? ` · ${l.group_name}` : ''}
                  </div>
                </div>
                {statusChip(l.status)}
                {l.status !== 'approved' && (
                  <SubmitButton onClick={() => report(l.lesson_id)} loading={busy === l.lesson_id}
                    style={{ fontSize: 12, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', opacity: busy === l.lesson_id ? 0.6 : 1 }}>
                    {l.status === 'reported' ? t('re_report') : l.status === 'rejected' ? t('re_report') : t('report')}
                  </SubmitButton>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
