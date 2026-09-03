'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { SkeletonRows } from '@/components/ui/Skeleton'

interface Prep {
  students_total: number; assigned: number; unassigned: number
  levels: number; courses: number; courses_with_issues: number; pending_teacher_approvals: number
}
interface Student {
  journey_id: string; name: string; photo_url: string | null
  kodesh_group_name: string | null; primary_track_name: string | null; year_level: number | null; alerts_open: number
}

export default function KodeshHomeClient() {
  const t = useTranslations('education.kodesh_home')
  const [prep, setPrep] = useState<Prep | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'prep' | 'semester' | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const [homeRes, periodsRes] = await Promise.all([
          fetch('/api/education/kodesh/home'),
          fetch('/api/education/periods'),
        ])
        let currentActive = false
        if (periodsRes.ok) { const pb = await periodsRes.json() as { current_active?: boolean }; currentActive = !!pb.current_active }
        if (homeRes.ok) {
          const b = await homeRes.json()
          setPrep(b.prep ?? null); setStudents(b.students ?? [])
          // Авто-переключение по периоду (spec §4.2/§4.11, решение архитектора):
          // активный семестр (его диапазон содержит сегодня) → экран семестра;
          // иначе (перед открытием) → экран подготовки. Пользователь может
          // переключить вручную.
          setView(currentActive ? 'semester' : 'prep')
        }
      } finally { setLoading(false) }
    })()
  }, [])

  if (loading || view === null) return <SkeletonRows rows={6} />

  const yearName = (n: number | null) => n ? t('year_n').replace('{n}', String(n)) : ''

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Переключатель экранов */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['prep', 'semester'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            fontSize: 13, fontWeight: view === v ? 700 : 500, padding: '7px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
            border: `1px solid ${view === v ? 'var(--accent-strong)' : 'var(--border-strong)'}`,
            background: view === v ? 'var(--accent-tint)' : 'var(--surface)', color: view === v ? 'var(--accent-strong)' : 'var(--text-muted)',
          }}>{t(v === 'prep' ? 'view_prep' : 'view_semester')}</button>
        ))}
      </div>

      {view === 'prep' && prep && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            <Kpi label={t('kpi_assigned')} value={`${prep.assigned}/${prep.students_total}`} tone={prep.unassigned > 0 ? 'warn' : 'ok'} href="/dashboard/education/kodesh" />
            <Kpi label={t('kpi_unassigned')} value={prep.unassigned} tone={prep.unassigned > 0 ? 'warn' : 'ok'} href="/dashboard/education/kodesh" />
            <Kpi label={t('kpi_levels')} value={prep.levels} tone="info" href="/dashboard/education/kodesh" />
            <Kpi label={t('kpi_courses')} value={prep.courses} tone="info" href="/dashboard/education/kodesh-courses" />
            <Kpi label={t('kpi_courses_issues')} value={prep.courses_with_issues} tone={prep.courses_with_issues > 0 ? 'warn' : 'ok'} href="/dashboard/education/kodesh-courses" />
            <Kpi label={t('kpi_pending_teachers')} value={prep.pending_teacher_approvals} tone={prep.pending_teacher_approvals > 0 ? 'warn' : 'ok'} href="/dashboard/education/kodesh-rav" />
          </div>
          {/* Чек-лист перед публикацией */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 8px', color: 'var(--text)' }}>{t('checklist_title')}</h3>
            <ul style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 4, fontSize: 13 }}>
              <ChecklistItem ok={prep.unassigned === 0} label={t('check_all_assigned')} />
              <ChecklistItem ok={prep.courses_with_issues === 0} label={t('check_courses_complete')} />
              <ChecklistItem ok={prep.pending_teacher_approvals === 0} label={t('check_teachers_approved')} />
            </ul>
          </div>
        </div>
      )}

      {view === 'semester' && (
        students.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('no_students')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {students.map(s => (
              <div key={s.journey_id} style={{ display: 'flex', gap: 10, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 11 }}>
                <Avatar name={s.name} photo={s.photo_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name || '—'}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>
                    {s.primary_track_name || t('no_track')}{s.year_level ? ` · ${yearName(s.year_level)}` : ''}
                  </div>
                  <div style={{ fontSize: 11.5, color: s.kodesh_group_name ? 'var(--accent-strong)' : 'var(--warn)', marginTop: 1 }}>
                    {s.kodesh_group_name || t('no_kodesh')}
                  </div>
                </div>
                {s.alerts_open > 0 && (
                  <span title={t('alerts_open')} style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--warn)', borderRadius: 999, minWidth: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{s.alerts_open}</span>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function Kpi({ label, value, tone, href }: { label: string; value: string | number; tone: 'ok' | 'warn' | 'info'; href?: string }) {
  const color = tone === 'warn' ? 'var(--warn)' : tone === 'ok' ? 'var(--success)' : 'var(--accent-strong)'
  const body = (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: '12px 14px', boxShadow: 'var(--shadow)' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  )
  return href ? <Link href={href} style={{ textDecoration: 'none' }}>{body}</Link> : body
}

function ChecklistItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li style={{ color: ok ? 'var(--success)' : 'var(--warn)', listStyle: 'none', display: 'flex', gap: 8, alignItems: 'center' }}>
      <span>{ok ? '✓' : '•'}</span><span style={{ color: 'var(--text)' }}>{label}</span>
    </li>
  )
}

function Avatar({ name, photo }: { name: string; photo: string | null }) {
  const initials = (name || '?').trim().slice(0, 2)
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt={name} style={{ width: 40, height: 40, borderRadius: 999, objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <div style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--accent-tint)', color: 'var(--accent-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
  )
}
