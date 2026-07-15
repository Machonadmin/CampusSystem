'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { useMe } from '@/lib/hooks/useMe'
import SignatureCapture, { type SignatureMethod, type SignaturePayload } from '@/components/workflow/SignatureCapture'

interface Final { id: string; code: string; name_ru: string; is_positive: boolean; sort_order: number }
interface StageCell {
  stage_instance_id: string
  stage_code: string
  stage_name: string
  required_role_code: string | null
  status: string
  final_code: string | null
  note: string | null
  signer_name: string | null
  can_sign: boolean
  finals: Final[]
}
interface Applicant {
  journey_id: string
  process_instance_id: string
  process_status: string
  education_status: string | null
  applicant: { full_name: string; hebrew_name: string | null; photo_url: string | null; phones: string[] }
  stages: StageCell[]
}

// Порядок колонок обзора (медицинский может отсутствовать — тогда «—»).
const STAGE_ORDER = ['academic', 'dormitory', 'jewishness', 'medical', 'final_approval'] as const

type StatusFilter = 'active' | 'completed' | 'all'

interface SignModal {
  applicant: string
  cell: StageCell
}

export default function AcceptanceOverviewTab() {
  const t = useTranslations('education')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const me = useMe()

  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [sigMethod, setSigMethod] = useState<SignatureMethod>('both')
  const [filter, setFilter] = useState<StatusFilter>('active')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Sign modal
  const [modal, setModal] = useState<SignModal | null>(null)
  const [selectedFinal, setSelectedFinal] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [sig, setSig] = useState<SignaturePayload | null>(null)
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState('')

  // Маршрут חол, выбираемый прямо при приёме (אישור לימודים).
  const [tracks, setTracks] = useState<Array<{ id: string; name_he: string }>>([])
  const [trackId, setTrackId] = useState('')
  const isAdmit = selectedFinal === 'admitted' || selectedFinal === 'admitted_conditional'

  useEffect(() => {
    fetch('/api/education/study-tracks')
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (b?.tracks) setTracks(b.tracks) })
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/education/acceptance-overview?status=${filter}`)
      if (res.status === 403) { setApplicants([]); return } // нет доступа — просто пусто
      if (!res.ok) { setError(t('overview.load_error')); setApplicants([]); return }
      const b = await res.json()
      setApplicants(b.applicants ?? [])
      setSigMethod((b.signature_method ?? 'both') as SignatureMethod)
    } catch {
      setError(t('overview.load_error'))
    } finally {
      setLoading(false)
    }
  }, [filter, t])

  useEffect(() => { load() }, [load])

  function openSign(applicantName: string, cell: StageCell) {
    setModal({ applicant: applicantName, cell })
    setSelectedFinal(null); setNote(''); setSig(null); setSignError(''); setTrackId('')
  }

  async function submitSign() {
    if (!modal || !selectedFinal) return
    setSigning(true); setSignError('')
    try {
      let signatureBody: Record<string, unknown> | undefined
      if (sig) {
        if (sig.kind === 'drawn' && sig.drawing_blob) {
          const fd = new FormData()
          fd.append('file', sig.drawing_blob, 'signature.png')
          const up = await fetch(`/api/workflow/stages/${modal.cell.stage_instance_id}/signature/upload`, { method: 'POST', body: fd })
          if (!up.ok) { const d = await up.json().catch(() => ({})) as { error?: string }; setSignError(d.error ?? tCommon('error')); return }
          const { storage_path } = await up.json() as { storage_path: string }
          signatureBody = { kind: 'drawn', drawing_path: storage_path }
        } else if (sig.kind === 'typed' && sig.typed_name) {
          signatureBody = { kind: 'typed', typed_name: sig.typed_name }
        }
      }
      const rd: Record<string, unknown> = {}
      if (signatureBody) rd.signature = signatureBody
      if (note.trim()) rd.note = note.trim()
      if (isAdmit && trackId) rd.track_id = trackId
      const body: Record<string, unknown> = { final_code: selectedFinal }
      if (Object.keys(rd).length) body.result_data = rd

      const res = await fetch(`/api/workflow/stages/${modal.cell.stage_instance_id}/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setSignError(d.error ?? tCommon('error')); return }
      setModal(null)
      load()
    } finally {
      setSigning(false)
    }
  }

  const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'active', label: t('overview.filter_active') },
    { key: 'completed', label: t('overview.filter_completed') },
    { key: 'all', label: t('overview.filter_all') },
  ]

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Filter */}
      <div style={{ display: 'flex', gap: 6 }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${filter === f.key ? 'var(--accent)' : 'var(--border-strong)'}`,
              background: filter === f.key ? 'var(--accent-tint)' : 'var(--surface)',
              color: filter === f.key ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflowX: 'auto' }}>
        {error ? (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--danger)' }}>{error}</div>
        ) : loading ? (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--text-faint)' }}>{t('overview.loading')}</div>
        ) : applicants.length === 0 ? (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--text-faint)' }}>{t('overview.no_data')}</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--surface-2)' }}>
                <th style={th}>{t('overview.applicant')}</th>
                {STAGE_ORDER.map(code => (
                  <th key={code} style={th}>{t(`acceptance_stages.${code}`, code)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {applicants.map(app => {
                const byCode = new Map(app.stages.map(s => [s.stage_code, s]))
                const name = app.applicant.full_name || app.applicant.hebrew_name || '—'
                return (
                  <tr key={app.process_instance_id} style={{ borderBottom: '1px solid var(--surface-2)' }}>
                    <td style={{ ...td, minWidth: 160 }}>
                      <button
                        onClick={() => router.push(`/dashboard/education/leads/${app.journey_id}`)}
                        style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'start' }}
                      >
                        {name}
                      </button>
                    </td>
                    {STAGE_ORDER.map(code => {
                      const cell = byCode.get(code)
                      return (
                        <td key={code} style={{ ...td, minWidth: 130 }}>
                          {!cell ? (
                            <span style={{ fontSize: 12, color: 'var(--border-strong)' }}>{t('overview.none')}</span>
                          ) : (
                            <Cell cell={cell} onSign={() => openSign(name, cell)}
                              pendingLabel={t('overview.pending')} signLabel={t('overview.sign')}
                              finalLabel={c => t(`acceptance_finals.${c}`, c)} />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Sign modal */}
      {modal && (
        <div onClick={() => !signing && setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, padding: 20, width: 'min(520px, 100%)', boxShadow: '0 10px 40px rgba(0,0,0,0.25)', display: 'grid', gap: 12, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              {t(`acceptance_stages.${modal.cell.stage_code}`, modal.cell.stage_name)} — {modal.applicant}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {modal.cell.finals.map(f => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFinal(f.code)}
                  style={{
                    fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${selectedFinal === f.code ? (f.is_positive ? 'var(--success)' : 'var(--danger)') : 'var(--border-strong)'}`,
                    background: selectedFinal === f.code ? (f.is_positive ? 'var(--success-tint)' : 'var(--danger-tint)') : 'var(--surface)',
                    color: selectedFinal === f.code ? (f.is_positive ? 'var(--success)' : 'var(--danger)') : 'var(--text)',
                  }}
                >
                  {t(`acceptance_finals.${f.code}`, f.name_ru)}
                </button>
              ))}
            </div>

            {isAdmit && tracks.length > 0 && (
              <div style={{ display: 'grid', gap: 4, padding: '10px 12px', border: '1px solid var(--accent)', background: 'var(--accent-tint)', borderRadius: 8 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-strong)' }}>{t('overview.track_label')}</label>
                <select value={trackId} onChange={e => setTrackId(e.target.value)}
                  style={{ fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }}>
                  <option value="">{t('overview.track_later')}</option>
                  {tracks.map(tr => <option key={tr.id} value={tr.id}>{tr.name_he}</option>)}
                </select>
              </div>
            )}

            {selectedFinal && (
              <>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={`${tCommon('optional_note')} — ${tCommon('note_placeholder')}`}
                  rows={2}
                  style={{ fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                />
                <SignatureCapture method={sigMethod} defaultTypedName={me?.full_name ?? undefined} onChange={setSig} />
              </>
            )}

            {signError && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{signError}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} disabled={signing} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
                {tCommon('cancel')}
              </button>
              <button onClick={submitSign} disabled={signing || !selectedFinal || !sig} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: signing || !selectedFinal || !sig ? 'var(--text-faint)' : 'var(--accent)', color: '#fff', cursor: signing || !selectedFinal || !sig ? 'default' : 'pointer' }}>
                {tCommon('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Cell({
  cell, onSign, pendingLabel, signLabel, finalLabel,
}: {
  cell: StageCell
  onSign: () => void
  pendingLabel: string
  signLabel: string
  finalLabel: (code: string) => string
}) {
  const done = cell.status === 'completed' && cell.final_code
  const positive = ['approved', 'admitted', 'admitted_conditional'].includes(cell.final_code ?? '')
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {done ? (
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, justifySelf: 'start', background: positive ? 'var(--success-tint)' : 'var(--danger-tint)', color: positive ? 'var(--success)' : 'var(--danger)' }}>
          {finalLabel(cell.final_code!)}
        </span>
      ) : cell.status === 'active' ? (
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, justifySelf: 'start', background: 'var(--warn-tint)', color: 'var(--warn)' }}>
          {pendingLabel}
        </span>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--border-strong)' }}>—</span>
      )}
      {cell.signer_name && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cell.signer_name}</span>}
      {cell.note && <span style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic' }} title={cell.note}>{cell.note.length > 28 ? cell.note.slice(0, 28) + '…' : cell.note}</span>}
      {cell.can_sign && cell.finals.length > 0 && (
        <button onClick={onSign} style={{ justifySelf: 'start', fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          ✍ {signLabel}
        </button>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textAlign: 'start', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'top' }
