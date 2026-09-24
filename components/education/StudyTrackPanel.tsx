'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'

interface Track { id: string; code: string; name_he: string; name_ru: string; name_en: string; sort_order: number; years_count?: number }
interface TrackRow { track_id: string; role?: string; notes?: string | null; year_level?: number; completed_at?: string | null }

function trackName(tr: Track | undefined, lang: string): string {
  if (!tr) return ''
  if (lang === 'he') return tr.name_he
  if (lang === 'en') return tr.name_en
  return tr.name_ru
}

/**
 * Панель учебного маршрута на карточке студентки. Первая половина дня —
 * иудаизм для всех (кодеш). Вторая — ГЛАВНЫЙ маршрут (primary) + опциональные
 * ДОПОЛНИТЕЛЬНЫЕ (additional, напр. Туро) — spec §3.2. Editable под canEdit
 * (manage_students). Не рендерит ошибку, если таблиц ещё нет — просто «не задан».
 */
export default function StudyTrackPanel({ journeyId, canEdit }: { journeyId: string; canEdit: boolean }) {
  const t = useTranslations('education')
  const { lang } = useLang()

  const [tracks, setTracks] = useState<Track[]>([])
  const [rows, setRows] = useState<TrackRow[]>([])
  const [trackId, setTrackId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [yearLevel, setYearLevel] = useState(1)
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  const [reactivate, setReactivate] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addTrackId, setAddTrackId] = useState('')
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const [tr, cur] = await Promise.all([
        fetch('/api/education/study-tracks'),
        fetch(`/api/education/journeys/${journeyId}/track`),
      ])
      if (tr.ok) { const b = await tr.json(); setTracks(b.tracks ?? []) }
      if (cur.ok) {
        const b = await cur.json()
        setRows(b.tracks ?? [])
        setTrackId(b.track?.track_id ?? null)
        setNotes(b.track?.notes ?? '')
        setYearLevel(b.track?.year_level ?? 1)
        setCompletedAt(b.track?.completed_at ?? null)
      }
    } catch { /* тихо */ }
    finally { setLoaded(true) }
  }, [journeyId])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/track`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: trackId, role: 'primary', notes: notes.trim() || null, year_level: yearLevel, reactivate }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? t('study_track.save_error')); return }
      setEditing(false)
      setReactivate(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function addAdditional() {
    if (!addTrackId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/track`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: addTrackId, role: 'additional' }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; toast(d.error ?? t('study_track.save_error'), 'error'); return }
      setAddTrackId('')
      load()
    } finally { setSaving(false) }
  }

  async function removeTrack(id: string) {
    setSaving(true)
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/track?track_id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; toast(d.error ?? t('study_track.save_error'), 'error'); return }
      load()
    } finally { setSaving(false) }
  }

  if (!loaded) return null

  const current = tracks.find(x => x.id === trackId)
  const maxYears = Math.min(4, Math.max(1, current?.years_count ?? 4))
  const yearName = (n: number) => t(`study.subjects.year_${n}`)
  const additional = rows.filter(r => (r.role ?? 'primary') === 'additional')
  const additionalIds = new Set(additional.map(r => r.track_id))
  const addable = tracks.filter(tr => tr.id !== trackId && !additionalIds.has(tr.id))

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('study_track.title')}</h3>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer' }}>
            {t('study_track.edit')}
          </button>
        )}
      </div>

      {/* Первая половина — инфо */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface-2)', borderRadius: 8, padding: '6px 10px', marginBottom: 10 }}>
        {t('study_track.first_half')}
      </div>

      {!editing ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-faint)' }}>{t('study_track.second_half')}: </span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{current ? trackName(current, lang) : t('study_track.unassigned')}</span>
            {current && (
              <span style={{ color: 'var(--text-muted)' }}>· {yearName(yearLevel)}</span>
            )}
            {completedAt && (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)', background: 'var(--success-tint)', borderRadius: 8, padding: '2px 8px' }}>
                {t('study_track.completed')}
              </span>
            )}
          </div>
          {additional.length > 0 && (
            <div style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-faint)' }}>{t('study_track.additional_label')}: </span>
              {additional.map(r => {
                const tr = tracks.find(x => x.id === r.track_id)
                return (
                  <span key={r.track_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--accent-strong)', background: 'var(--accent-tint)', borderRadius: 999, padding: '2px 10px' }}>
                    {trackName(tr, lang) || r.track_id}
                    {canEdit && (
                      <button onClick={() => removeTrack(r.track_id)} disabled={saving} aria-label={t('study_track.remove_additional')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                    )}
                  </span>
                )
              })}
            </div>
          )}
          {notes && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--text-faint)' }}>{t('study_track.notes_label')}: </span>{notes}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{t('study_track.second_half')}</span>
            <select
              value={trackId ?? ''}
              onChange={e => {
                const id = e.target.value || null
                setTrackId(id)
                const tr = tracks.find(x => x.id === id)
                const max = Math.min(4, Math.max(1, tr?.years_count ?? 4))
                if (yearLevel > max) setYearLevel(1)
              }}
              style={{ fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)' }}
            >
              <option value="">{t('study_track.choose')}</option>
              {tracks.map(tr => <option key={tr.id} value={tr.id}>{trackName(tr, lang)}</option>)}
            </select>
          </label>
          {trackId && (
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{t('study_track.year_label')}</span>
              <select
                value={yearLevel}
                onChange={e => setYearLevel(Number(e.target.value))}
                style={{ fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)' }}
              >
                {Array.from({ length: maxYears }, (_, i) => i + 1).map(n => (
                  <option key={n} value={n}>{yearName(n)}</option>
                ))}
              </select>
            </label>
          )}
          {completedAt && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={reactivate} onChange={e => setReactivate(e.target.checked)} />
              {t('study_track.reactivate')}
            </label>
          )}
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{t('study_track.notes_label')}</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              style={{ fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </label>

          {/* Дополнительные маршруты */}
          <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--surface-2)', paddingTop: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{t('study_track.additional_label')}</span>
            {additional.map(r => {
              const tr = tracks.find(x => x.id === r.track_id)
              return (
                <div key={r.track_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: 'var(--text)' }}>{trackName(tr, lang) || r.track_id}</span>
                  <button onClick={() => removeTrack(r.track_id)} disabled={saving} style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    {t('study_track.remove_additional')}
                  </button>
                </div>
              )
            })}
            {addable.length > 0 && (
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={addTrackId} onChange={e => setAddTrackId(e.target.value)} style={{ flex: 1, fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)' }}>
                  <option value="">{t('study_track.add_additional_choose')}</option>
                  {addable.map(tr => <option key={tr.id} value={tr.id}>{trackName(tr, lang)}</option>)}
                </select>
                <button onClick={addAdditional} disabled={saving || !addTrackId} style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-strong)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '7px 14px', cursor: addTrackId ? 'pointer' : 'default' }}>
                  {t('study_track.add')}
                </button>
              </div>
            )}
          </div>

          {error && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: saving ? 'var(--text-faint)' : 'var(--accent-strong)', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: saving ? 'default' : 'pointer' }}>
              {saving ? t('study_track.saving') : t('study_track.save')}
            </button>
            <button onClick={() => { setEditing(false); load() }} disabled={saving} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }}>
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
