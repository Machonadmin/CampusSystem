'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import PageActionButton from '@/components/ui/PageActionButton'
import SubjectModal from './SubjectModal'
import SubjectSemestersModal from './SubjectSemestersModal'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'

interface Track {
  id: string
  code: string
  name_he: string
  name_ru: string
  name_en: string
  years_count?: number
}

interface Subject {
  id: string
  name: string
  name_he: string | null
  sort_order: number
  is_active: boolean
  study_track_id: string | null
  year_level: number | null
  track: Track | null
  created_at: string
  updated_at: string
}

const accent = getModuleColor('education')

function trackName(tr: Track | null, lang: string): string {
  if (!tr) return '—'
  if (lang === 'he') return tr.name_he || tr.name_ru
  if (lang === 'en') return tr.name_en || tr.name_ru
  return tr.name_ru
}

export default function SubjectsTab() {
  const t = useTranslations('education.study')
  const { lang } = useLang()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterTrack, setFilterTrack] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [semSubject, setSemSubject] = useState<Subject | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sResp, tResp] = await Promise.all([
        fetch(`/api/education/subjects?active_only=${showInactive ? 'false' : 'true'}`),
        fetch('/api/education/study-tracks'),
      ])
      if (!sResp.ok) throw new Error(t('subjects.load_error').replace('{status}', String(sResp.status)))
      const sJson = await sResp.json()
      const tJson = tResp.ok ? await tResp.json() : { tracks: [] }
      setSubjects(sJson.subjects ?? [])
      setTracks(tJson.tracks ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error_unknown'))
    } finally {
      setLoading(false)
    }
  }, [showInactive, t])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = async (subj: Subject) => {
    if (!confirm(t('subjects.confirm_delete').replace('{name}', subj.name))) return
    try {
      const resp = await fetch(`/api/education/subjects/${subj.id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        toast(err.error ?? t('common.error_delete_failed'), 'error')
        return
      }
      loadData()
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error_delete_generic'), 'error')
    }
  }

  const handleSaved = () => {
    setModalMode(null)
    setEditingSubject(null)
    loadData()
  }

  const filtered = filterTrack
    ? subjects.filter(s => s.study_track_id === filterTrack)
    : subjects

  const inp: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none' }
  const btnSecondary: React.CSSProperties = {
    padding: '5px 10px', fontSize: 12, color: 'var(--text)',
    background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
  }

  return (
    <div>
      {/* Тулбар */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={filterTrack}
          onChange={e => setFilterTrack(e.target.value)}
          style={inp}
        >
          <option value="">{t('subjects.all_tracks')}</option>
          {tracks.map(tr => (
            <option key={tr.id} value={tr.id}>{trackName(tr, lang)}</option>
          ))}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
          />
          {t('common.show_inactive')}
        </label>

        <div style={{ flex: 1 }} />

        <PageActionButton
          label={t('subjects.add_button')}
          onClick={() => { setEditingSubject(null); setModalMode('create') }}
          accentColor={accent}
        />
      </div>

      {loading && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('common.loading')}</div>
      )}

      {error && (
        <div style={{ padding: 12, background: 'var(--danger-tint)', color: '#991B1B', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
            {subjects.length === 0 ? t('subjects.empty_none') : t('common.nothing_found')}
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={thStyle}>{t('subjects.table_name')}</th>
                  <th style={thStyle}>{t('subjects.track_label')}</th>
                  <th style={{ ...thStyle, width: 90 }}>{t('subjects.year_label')}</th>
                  <th style={{ ...thStyle, width: 80, textAlign: 'center' }}>{t('subjects.table_sort_order')}</th>
                  <th style={{ ...thStyle, width: 100 }}>{t('subjects.table_status')}</th>
                  <th style={{ ...thStyle, width: 230 }}>{t('subjects.table_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr
                    key={s.id}
                    style={{ borderTop: '1px solid var(--surface-2)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                  >
                    <td style={tdStyle}>{s.name}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{trackName(s.track, lang)}</td>
                    <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{s.year_level ? t(`subjects.year_${s.year_level}`) : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-faint)' }}>{s.sort_order}</td>
                    <td style={tdStyle}>
                      {s.is_active ? (
                        <span style={{ color: '#10B981', fontWeight: 500 }}>{t('subjects.status_active')}</span>
                      ) : (
                        <span style={{ color: 'var(--text-faint)' }}>{t('subjects.status_inactive')}</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setSemSubject(s)}
                          style={{ ...btnSecondary, color: accent, borderColor: accent }}
                        >
                          {t('subjects.sem_button')}
                        </button>
                        <button
                          onClick={() => { setEditingSubject(s); setModalMode('edit') }}
                          style={btnSecondary}
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
                          style={{ ...btnSecondary, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                        >
                          {t('common.delete')}
                        </button>
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
        <SubjectModal
          mode={modalMode}
          initial={editingSubject}
          tracks={tracks}
          onClose={() => { setModalMode(null); setEditingSubject(null) }}
          onSaved={handleSaved}
        />
      )}

      {semSubject && (
        <SubjectSemestersModal
          subjectId={semSubject.id}
          subjectName={semSubject.name}
          onClose={() => setSemSubject(null)}
        />
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', fontWeight: 600, color: 'var(--text)',
  textAlign: 'start', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '10px 12px', color: 'var(--text)' }
