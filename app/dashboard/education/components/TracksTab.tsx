'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import PageActionButton from '@/components/ui/PageActionButton'
import TrackModal, { type TrackRow } from './TrackModal'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { SkeletonRows } from '@/components/ui/Skeleton'

const accent = getModuleColor('education')

function trackName(tr: TrackRow, lang: string): string {
  if (lang === 'he') return tr.name_he || tr.name_ru
  if (lang === 'en') return tr.name_en || tr.name_ru
  return tr.name_ru
}

/**
 * Каталог учебных маршрутов (מסלולי לימוד) — CRUD институтского уровня (spec §3.2).
 * Право: manage_tracks (сервер отдаёт 403 иначе). Маршруты — институтские, не
 * кодеш, поэтому экран отдельный от кодеша. Всё редактируемо (§0.3).
 */
export default function TracksTab() {
  const t = useTranslations('education.tracks')
  const { lang } = useLang()
  const [tracks, setTracks] = useState<TrackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(true)

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<TrackRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/education/study-tracks?includeInactive=1')
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({})) as { error?: string }
        throw new Error(e.error ?? String(resp.status))
      }
      const b = await resp.json()
      setTracks(b.tracks ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (tr: TrackRow) => {
    if (!(await confirmDialog({ message: t('confirm_delete').replace('{name}', trackName(tr, lang)), tone: 'danger' }))) return
    try {
      const resp = await fetch(`/api/education/study-tracks/${tr.id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { code?: string; error?: string }
        toast(err.code === 'track_in_use' ? t('in_use_deactivate') : (err.error ?? String(resp.status)), 'error')
        return
      }
      load()
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  const handleSaved = () => { setModalMode(null); setEditing(null); load() }

  const visible = showInactive ? tracks : tracks.filter(tr => tr.is_active)

  const btnSecondary: React.CSSProperties = {
    padding: '5px 10px', fontSize: 12, color: 'var(--text)',
    background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          {t('show_inactive')}
        </label>
        <div style={{ flex: 1 }} />
        <PageActionButton label={t('add_button')} onClick={() => { setEditing(null); setModalMode('create') }} accentColor={accent} />
      </div>

      {loading && <SkeletonRows avatar={false} rows={6} />}

      {error && (
        <div style={{ padding: 12, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        visible.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('empty')}</div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
            <table className="cards-sm" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={thStyle}>{t('table_name')}</th>
                  <th style={thStyle}>{t('code_label')}</th>
                  <th style={thStyle}>{t('category_label')}</th>
                  <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>{t('years_count_label')}</th>
                  <th style={{ ...thStyle, width: 100 }}>{t('table_status')}</th>
                  <th style={{ ...thStyle, width: 170 }}>{t('table_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(tr => (
                  <tr key={tr.id} style={{ borderTop: '1px solid var(--surface-2)' }}>
                    <td style={tdStyle} data-label={t('table_name')}>{trackName(tr, lang)}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', fontFamily: 'monospace' }} data-label={t('code_label')} dir="ltr">{tr.code}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }} data-label={t('category_label')} dir="ltr">{tr.category ?? '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-faint)' }} data-label={t('years_count_label')}>{tr.years_count}</td>
                    <td style={tdStyle} data-label={t('table_status')}>
                      {tr.is_active
                        ? <span style={{ color: 'var(--success)', fontWeight: 500 }}>{t('status_active')}</span>
                        : <span style={{ color: 'var(--text-faint)' }}>{t('status_inactive')}</span>}
                    </td>
                    <td style={tdStyle} data-label="">
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setEditing(tr); setModalMode('edit') }} style={btnSecondary}>{t('edit')}</button>
                        <button onClick={() => handleDelete(tr)} style={{ ...btnSecondary, color: 'var(--danger)', borderColor: 'var(--danger)' }}>{t('delete')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {modalMode && (
        <TrackModal mode={modalMode} initial={editing} onClose={() => { setModalMode(null); setEditing(null) }} onSaved={handleSaved} />
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', fontWeight: 600, color: 'var(--text)',
  textAlign: 'start', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '10px 12px', color: 'var(--text)' }
