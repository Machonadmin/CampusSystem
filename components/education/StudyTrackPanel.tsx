'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'

interface Track { id: string; code: string; name_he: string; name_ru: string; name_en: string; sort_order: number }

function trackName(tr: Track | undefined, lang: string): string {
  if (!tr) return ''
  if (lang === 'he') return tr.name_he
  if (lang === 'en') return tr.name_en
  return tr.name_ru
}

/**
 * Панель учебного маршрута на карточке студентки. Первая половина дня —
 * иудаизм для всех (инфо), вторая — выбираемый маршрут (Туро/Школа/Колледж) +
 * заметка для исключений. Editable под canEdit (manage_students). Не рендерит
 * ошибку, если таблиц ещё нет — просто «не задан».
 */
export default function StudyTrackPanel({ journeyId, canEdit }: { journeyId: string; canEdit: boolean }) {
  const t = useTranslations('education')
  const { lang } = useLang()

  const [tracks, setTracks] = useState<Track[]>([])
  const [trackId, setTrackId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const [tr, cur] = await Promise.all([
        fetch('/api/education/study-tracks'),
        fetch(`/api/education/journeys/${journeyId}/track`),
      ])
      if (tr.ok) { const b = await tr.json(); setTracks(b.tracks ?? []) }
      if (cur.ok) { const b = await cur.json(); setTrackId(b.track?.track_id ?? null); setNotes(b.track?.notes ?? '') }
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
        body: JSON.stringify({ track_id: trackId, notes: notes.trim() || null }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? t('study_track.save_error')); return }
      setEditing(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null

  const current = tracks.find(x => x.id === trackId)

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
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
          <div style={{ fontSize: 13 }}>
            <span style={{ color: 'var(--text-faint)' }}>{t('study_track.second_half')}: </span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{current ? trackName(current, lang) : t('study_track.unassigned')}</span>
          </div>
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
              onChange={e => setTrackId(e.target.value || null)}
              style={{ fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)' }}
            >
              <option value="">{t('study_track.choose')}</option>
              {tracks.map(tr => <option key={tr.id} value={tr.id}>{trackName(tr, lang)}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{t('study_track.notes_label')}</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              style={{ fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </label>
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
