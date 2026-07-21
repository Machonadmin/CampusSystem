'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'

interface Track { id: string; code: string; name_he: string; name_ru: string; name_en: string }
interface Student { journey_id: string; name: string; department: { id: string; name: string } | null }

export default function TrackAssignmentPage() {
  const t = useTranslations('education.track_assign')
  const tNav = useTranslations('navigation')
  const { lang } = useLang()

  const [tracks, setTracks] = useState<Track[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const trackName = (tr: Track) => (lang === 'he' ? tr.name_he : lang === 'ru' ? tr.name_ru : tr.name_en) || tr.name_he

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const [wl, tk] = await Promise.all([
        fetch('/api/education/track-assignment'),
        fetch('/api/education/study-tracks'),
      ])
      if (wl.ok) { const b = await wl.json(); setStudents(b.students ?? []) }
      if (tk.ok) { const b = await tk.json(); setTracks(b.tracks ?? []) }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const assign = async (journeyId: string) => {
    const trackId = choice[journeyId]
    if (!trackId) return
    setBusyId(journeyId); setErr(null)
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/track`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ track_id: trackId }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('save_failed')); return }
      setStudents(prev => prev.filter(s => s.journey_id !== journeyId))
    } finally { setBusyId(null) }
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '16px 24px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{t('title')}</h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{t('subtitle')}</p>
      </div>

      {err && <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>…</div>
      ) : students.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--success)', fontSize: 14, fontWeight: 600 }}>✓ {t('all_assigned')}</div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
            {t('pending_count', '{n}').replace('{n}', String(students.length))}
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
            {students.map((s, i) => (
              <div key={s.journey_id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '11px 14px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{s.name || '—'}</div>
                  {s.department && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{s.department.name}</div>}
                </div>
                <select value={choice[s.journey_id] ?? ''} onChange={e => setChoice(c => ({ ...c, [s.journey_id]: e.target.value }))}
                  style={{ padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }}>
                  <option value="">{t('pick_track')}</option>
                  {tracks.map(tr => <option key={tr.id} value={tr.id}>{trackName(tr)}</option>)}
                </select>
                <button onClick={() => assign(s.journey_id)} disabled={!choice[s.journey_id] || busyId === s.journey_id}
                  style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, cursor: (!choice[s.journey_id] || busyId === s.journey_id) ? 'not-allowed' : 'pointer', opacity: (!choice[s.journey_id] || busyId === s.journey_id) ? 0.55 : 1 }}>
                  {busyId === s.journey_id ? t('saving') : t('assign')}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
