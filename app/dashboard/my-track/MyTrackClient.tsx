'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { ModuleHeader } from '@/components/ui/ModuleHeader'
import { Button } from '@/components/ui/Button'
import { SkeletonRows } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { planAddToTrack, type StudentTrackRow, type TrackLite } from '@/lib/education/track-picking'

interface TrackName { id: string; code: string; category?: string | null; name_he: string; name_ru: string; name_en: string }
interface Student {
  journey_id: string
  name: string
  department: { id: string; name: string } | null
  tracks: StudentTrackRow[]
}
type Filter = 'all' | 'mine' | 'free'

export default function MyTrackClient() {
  const t = useTranslations('my_track')
  const { lang } = useLang()
  const [tracks, setTracks] = useState<TrackName[] | null>(null)
  const [trackId, setTrackId] = useState<string>('')
  const [catalog, setCatalog] = useState<TrackName[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('mine')

  const nameOf = useCallback((tr: TrackName | undefined) =>
    !tr ? '—' : (lang === 'he' ? tr.name_he : lang === 'ru' ? tr.name_ru : tr.name_en) || tr.name_he, [lang])

  useEffect(() => {
    let alive = true
    fetch('/api/education/my-track', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(b => {
        if (!alive) return
        const list = (b.tracks ?? []) as TrackName[]
        setTracks(list)
        if (list.length > 0) setTrackId(list[0].id)
      })
      .catch(() => { if (alive) { setTracks([]); toastError(t('load_error')) } })
    return () => { alive = false }
  }, [t])

  const load = useCallback(async (id: string) => {
    if (!id) return
    setLoading(true)
    try {
      const r = await fetch(`/api/education/my-track/${id}/students`, { cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      const b = await r.json()
      setStudents(b.students ?? [])
      setCatalog(b.catalog ?? [])
    } catch {
      toastError(t('load_error'))
    } finally { setLoading(false) }
  }, [t])
  useEffect(() => { load(trackId) }, [trackId, load])

  const catalogMap = useMemo(() => new Map<string, TrackLite & TrackName>(catalog.map(c => [c.id, c])), [catalog])
  const target = catalogMap.get(trackId)

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return students.filter(s => {
      const inMine = s.tracks.some(r => r.track_id === trackId)
      if (filter === 'mine' && !inMine) return false
      if (filter === 'free' && s.tracks.length > 0) return false
      if (!needle) return true
      return s.name.toLowerCase().includes(needle) || (s.department?.name ?? '').toLowerCase().includes(needle)
    })
  }, [students, q, filter, trackId])

  const mineCount = useMemo(() => students.filter(s => s.tracks.some(r => r.track_id === trackId)).length, [students, trackId])

  const add = async (s: Student) => {
    setBusy(s.journey_id)
    try {
      const r = await fetch(`/api/education/my-track/${trackId}/students`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ journey_id: s.journey_id }),
      })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) { toastError(b.error ?? t('action_failed')); return }
      toastSuccess(b.role === 'additional' ? t('added_additional') : t('added_primary'))
      await load(trackId)
    } finally { setBusy(null) }
  }

  const remove = async (s: Student) => {
    if (!(await confirmDialog({ message: t('confirm_remove').replace('{name}', s.name), tone: 'danger' }))) return
    setBusy(s.journey_id)
    try {
      const r = await fetch(`/api/education/my-track/${trackId}/students?journey_id=${s.journey_id}`, { method: 'DELETE' })
      if (!r.ok) { const b = await r.json().catch(() => ({})); toastError(b.error ?? t('action_failed')); return }
      toastSuccess(t('removed'))
      await load(trackId)
    } finally { setBusy(null) }
  }

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px', fontSize: 12.5, borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border-strong)'}`,
    background: active ? 'var(--accent)' : 'var(--surface)', color: active ? '#fff' : 'var(--text)',
  })
  const input: React.CSSProperties = {
    padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8,
    background: 'var(--surface)', color: 'var(--text)', outline: 'none',
  }

  return (
    <div className="p-6 space-y-5">
      <ModuleHeader module="education" title={t('title')} subtitle={t('subtitle')} />

      {tracks === null && <SkeletonRows avatar={false} rows={4} />}
      {tracks !== null && tracks.length === 0 && <EmptyState text={t('no_tracks')} />}

      {tracks !== null && tracks.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {tracks.length > 1 && (
              <select aria-label={t('track_label')} value={trackId} onChange={e => setTrackId(e.target.value)} style={input}>
                {tracks.map(tr => <option key={tr.id} value={tr.id}>{nameOf(tr)}</option>)}
              </select>
            )}
            {tracks.length === 1 && <strong style={{ fontSize: 14 }}>{nameOf(tracks[0])}</strong>}
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('count_mine').replace('{n}', String(mineCount))}</span>
            <div style={{ flex: 1 }} />
            <input aria-label={t('search_placeholder')} placeholder={t('search_placeholder')} value={q} onChange={e => setQ(e.target.value)} style={{ ...input, minWidth: 220 }} />
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['mine', 'all', 'free'] as Filter[]).map(f => (
              <button key={f} type="button" onClick={() => setFilter(f)} style={chip(filter === f)}>
                {t(f === 'mine' ? 'filter_mine' : f === 'all' ? 'filter_all' : 'filter_free')}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('pair_hint')}</div>

          {loading ? <SkeletonRows avatar={false} rows={8} /> : visible.length === 0 ? (
            <EmptyState text={t('empty')} />
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
              <table className="cards-sm" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <th style={th}>{t('col_name')}</th>
                    <th style={th}>{t('col_department')}</th>
                    <th style={th}>{t('col_tracks')}</th>
                    <th style={{ ...th, width: 140 }}>{t('col_action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(s => {
                    const inMine = s.tracks.some(r => r.track_id === trackId)
                    const plan = target ? planAddToTrack(target, s.tracks, catalogMap) : null
                    return (
                      <tr key={s.journey_id} style={{ borderTop: '1px solid var(--surface-2)' }}>
                        <td style={td} data-label={t('col_name')}>{s.name || '—'}</td>
                        <td style={{ ...td, color: 'var(--text-muted)' }} data-label={t('col_department')}>{s.department?.name ?? '—'}</td>
                        <td style={td} data-label={t('col_tracks')}>
                          {s.tracks.length === 0
                            ? <span style={{ color: 'var(--text-faint)' }}>{t('no_track')}</span>
                            : s.tracks.map(r => (
                              <span key={r.track_id} style={{
                                display: 'inline-block', marginInlineEnd: 6, padding: '2px 8px', borderRadius: 10, fontSize: 12,
                                background: r.track_id === trackId ? 'var(--accent-tint, var(--surface-2))' : 'var(--surface-2)',
                                fontWeight: r.track_id === trackId ? 600 : 400,
                              }}>
                                {nameOf(catalogMap.get(r.track_id))} · {t(r.role === 'primary' ? 'role_primary' : 'role_additional')}
                              </span>
                            ))}
                        </td>
                        <td style={td} data-label="">
                          {inMine ? (
                            <Button size="sm" onClick={() => remove(s)} disabled={busy === s.journey_id}>{t('remove')}</Button>
                          ) : plan?.kind === 'add' ? (
                            <Button size="sm" variant="primary" onClick={() => add(s)} disabled={busy === s.journey_id}>{t('add')}</Button>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('blocked_hint')}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '10px 12px', fontWeight: 600, color: 'var(--text)',
  textAlign: 'start', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { padding: '10px 12px', color: 'var(--text)' }
