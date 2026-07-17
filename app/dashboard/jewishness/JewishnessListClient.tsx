'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import SignatureCapture, { type SignatureMethod, type SignaturePayload } from '@/components/workflow/SignatureCapture'
import { useMe } from '@/lib/hooks/useMe'

type Status = 'pending' | 'verified' | 'rejected' | 'needs_review'
const STATUSES: Status[] = ['pending', 'verified', 'rejected', 'needs_review']

interface ListStudent {
  journey_id: string
  full_name: string
  hebrew_name: string | null
  email: string | null
  phones: string[]
  photo_url: string | null
  status: Status
  doc_count: number
  has_active_stage: boolean
}
interface Counts { pending: number; verified: number; rejected: number; needs_review: number }

interface DetailDoc { id: string; doc_type: string; title: string | null; file_name: string | null; created_at: string }
interface HistoryItem { status: string; note: string | null; source: string | null; created_at: string; changed_by_name: string | null }
interface Final { id: string; code: string; name_ru: string; is_positive: boolean }
interface Detail {
  journey_id: string
  applicant: { person_id: string | null; full_name: string; hebrew_name: string | null; email: string | null; birth_date: string | null; citizenship: string | null }
  status: Status
  notes: string | null
  verified_by_name: string | null
  verified_at: string | null
  history: HistoryItem[]
  documents: DetailDoc[]
  active_stage_instance_id: string | null
  finals: Final[]
  signature_method: SignatureMethod
}

/** Цвета статус-бейджа: verified=зелёный, rejected=красный, needs_review=янтарный, pending=серый. */
function statusColors(s: string): { bg: string; fg: string } {
  switch (s) {
    case 'verified': return { bg: '#D1FAE5', fg: '#047857' }
    case 'rejected': return { bg: '#FEE2E2', fg: '#B91C1C' }
    case 'needs_review': return { bg: '#FEF3C7', fg: '#92400E' }
    default: return { bg: 'var(--surface-2)', fg: 'var(--text-muted)' }
  }
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString()
}
function fmtDateTime(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleString()
}

/**
 * Полный модуль בירור יהדות: список всех абитуриенток/студенток с их статусом
 * проверки еврейства, фильтр по статусу и поиск, карточка проверки (статус,
 * документы, история, установка статуса) и — на активном acceptance-этапе —
 * подписанное решение о приёме.
 */
export default function JewishnessListClient() {
  const t = useTranslations('jewishness')
  const tNav = useTranslations('navigation')
  const primary = getModuleColor('jewishness', 'primary')

  const [students, setStudents] = useState<ListStudent[]>([])
  const [counts, setCounts] = useState<Counts>({ pending: 0, verified: 0, rejected: 0, needs_review: 0 })
  const [sigMethod, setSigMethod] = useState<SignatureMethod>('both')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  // Дебаунс поиска.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (debouncedSearch) params.set('search', debouncedSearch)
      const qs = params.toString()
      const res = await fetch(`/api/jewishness${qs ? `?${qs}` : ''}`)
      if (!res.ok) { setError(t('load_error')); setStudents([]); return }
      const b = await res.json()
      setStudents(b.students ?? [])
      setCounts(b.counts ?? { pending: 0, verified: 0, rejected: 0, needs_review: 0 })
      setSigMethod((b.signature_method ?? 'both') as SignatureMethod)
    } catch {
      setError(t('load_error'))
    } finally {
      setLoading(false)
    }
  }, [statusFilter, debouncedSearch, t])

  useEffect(() => { load() }, [load])

  const total = counts.pending + counts.verified + counts.rejected + counts.needs_review
  const chips: Array<{ key: Status | 'all'; label: string; count: number }> = [
    { key: 'all', label: t('filter_all'), count: total },
    { key: 'pending', label: t('status_pending'), count: counts.pending },
    { key: 'verified', label: t('status_verified'), count: counts.verified },
    { key: 'rejected', label: t('status_rejected'), count: counts.rejected },
    { key: 'needs_review', label: t('status_needs_review'), count: counts.needs_review },
  ]

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('jewishness'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(202,138,4,0.15)',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{t('module_subtitle')}</div>
      </div>

      {/* Фильтр-чипы по статусу */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {chips.map(c => {
          const active = statusFilter === c.key
          const sc = c.key === 'all' ? null : statusColors(c.key)
          return (
            <button
              key={c.key}
              onClick={() => setStatusFilter(c.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${active ? primary : 'var(--border-strong)'}`,
                background: active ? primary : 'var(--surface)',
                color: active ? '#fff' : 'var(--text)',
              }}
            >
              <span>{c.label}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 999,
                background: active ? 'rgba(255,255,255,0.25)' : (sc ? sc.bg : 'var(--surface-2)'),
                color: active ? '#fff' : (sc ? sc.fg : 'var(--text-muted)'),
              }}>{c.count}</span>
            </button>
          )
        })}
      </div>

      {/* Поиск */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t('search_placeholder')}
        style={{ fontSize: 13, padding: '9px 12px', border: '1px solid var(--border-strong)', borderRadius: 8, width: '100%', maxWidth: 420 }}
      />

      {/* Список */}
      {error ? (
        <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('loading')}</div>
      ) : students.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, fontSize: 13, color: 'var(--text-faint)' }}>{t('empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {students.map(s => (
            <StudentRow key={s.journey_id} student={s} primary={primary} onOpen={() => setSelected(s.journey_id)} />
          ))}
        </div>
      )}

      {selected && (
        <DetailModal
          journeyId={selected}
          sigMethodFallback={sigMethod}
          primary={primary}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const c = statusColors(status)
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999,
      background: c.bg, color: c.fg, whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

function StudentRow({ student, primary, onOpen }: { student: ListStudent; primary: string; onOpen: () => void }) {
  const t = useTranslations('jewishness')
  const name = student.full_name || student.hebrew_name || '—'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{name}</span>
          {student.hebrew_name && student.full_name && student.hebrew_name !== student.full_name && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{student.hebrew_name}</span>
          )}
          <StatusBadge status={student.status} label={t(`status_${student.status}`)} />
          {student.has_active_stage && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'var(--surface-2)', color: primary, border: `1px solid ${primary}` }}>
              {t('in_acceptance')}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
          {student.email ? `${student.email} · ` : ''}{student.doc_count} · {t('documents')}
        </div>
      </div>
      <button
        onClick={onOpen}
        style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: primary, border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        {t('details')}
      </button>
    </div>
  )
}

function DetailModal({
  journeyId, sigMethodFallback, primary, onClose, onChanged,
}: {
  journeyId: string
  sigMethodFallback: SignatureMethod
  primary: string
  onClose: () => void
  onChanged: () => void
}) {
  const t = useTranslations('jewishness')
  const light = getModuleColor('jewishness', 'light')

  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDetail = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/jewishness/journeys/${journeyId}`)
      if (!res.ok) { setError(t('load_error')); setDetail(null); return }
      setDetail(await res.json() as Detail)
    } catch {
      setError(t('load_error'))
    } finally {
      setLoading(false)
    }
  }, [journeyId, t])

  useEffect(() => { loadDetail() }, [loadDetail])

  const name = detail ? (detail.applicant.full_name || detail.applicant.hebrew_name || '—') : '—'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', borderRadius: 12, width: '100%', maxWidth: 720, marginTop: 24, marginBottom: 24, overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>{name}</div>
            {detail?.applicant.hebrew_name && detail.applicant.hebrew_name !== detail.applicant.full_name && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{detail.applicant.hebrew_name}</div>
            )}
          </div>
          {detail && <StatusBadge status={detail.status} label={t(`status_${detail.status}`)} />}
          <button
            onClick={onClose}
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
          >
            {t('close')}
          </button>
        </div>

        <div style={{ padding: 18 }}>
          {error ? (
            <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
          ) : loading || !detail ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('loading')}</div>
          ) : (
            <DetailBody detail={detail} sigMethodFallback={sigMethodFallback} primary={primary} light={light} reload={async () => { await loadDetail(); onChanged() }} />
          )}
        </div>
      </div>
    </div>
  )
}

function DetailBody({
  detail, sigMethodFallback, primary, light, reload,
}: {
  detail: Detail
  sigMethodFallback: SignatureMethod
  primary: string
  light: string
  reload: () => Promise<void>
}) {
  const t = useTranslations('jewishness')
  const a = detail.applicant

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* Личные данные */}
      <Section title={t('personal_details')}>
        <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {a.email && <Field label={t('email')} value={a.email} />}
          {a.birth_date && <Field label={t('birth_date')} value={fmtDate(a.birth_date)} />}
          {a.citizenship && <Field label={t('citizenship')} value={a.citizenship} />}
        </div>
      </Section>

      {/* Текущий статус + кто/когда + заметки */}
      <Section title={t('current_status')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <StatusBadge status={detail.status} label={t(`status_${detail.status}`)} />
        </div>
        <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
          {detail.verified_by_name && <Field label={t('decided_by')} value={detail.verified_by_name} />}
          {detail.verified_at && <Field label={t('decided_at')} value={fmtDateTime(detail.verified_at)} />}
          {detail.notes && <Field label={t('notes_label')} value={detail.notes} />}
        </div>
      </Section>

      {/* Установка статуса (модульный путь) */}
      <SetStatusSection journeyId={detail.journey_id} current={detail.status} primary={primary} reload={reload} />

      {/* Документы + загрузка */}
      <DocumentsSection journeyId={detail.journey_id} documents={detail.documents} primary={primary} light={light} reload={reload} />

      {/* История */}
      <Section title={t('history_title')}>
        {detail.history.length === 0 ? (
          <div style={muted}>{t('history_empty')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {detail.history.map((h, i) => {
              const sourceLabel = h.source === 'module' ? t('source_module')
                : h.source === 'acceptance_stage' ? t('source_acceptance_stage')
                : (h.source ?? '')
              return (
                <div key={i} style={{ borderInlineStart: `3px solid ${statusColors(h.status).fg}`, paddingInlineStart: 10, paddingTop: 2, paddingBottom: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <StatusBadge status={h.status} label={t(`status_${h.status}`)} />
                    {sourceLabel && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        {sourceLabel}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{fmtDateTime(h.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {h.changed_by_name ?? '—'}{h.note ? ` · ${h.note}` : ''}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Подписанное решение о приёме — только на активном этапе */}
      {detail.active_stage_instance_id && (
        <AcceptanceDecisionSection
          stageInstanceId={detail.active_stage_instance_id}
          finals={detail.finals}
          sigMethod={detail.signature_method ?? sigMethodFallback}
          primary={primary}
          reload={reload}
        />
      )}
    </div>
  )
}

function SetStatusSection({
  journeyId, current, primary, reload,
}: {
  journeyId: string
  current: Status
  primary: string
  reload: () => Promise<void>
}) {
  const t = useTranslations('jewishness')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState<Status | null>(null)
  const [error, setError] = useState('')

  async function apply(status: Status) {
    setSaving(status); setError('')
    try {
      const res = await fetch(`/api/jewishness/journeys/${journeyId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: note.trim() || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? t('set_status_error')); return
      }
      setNote('')
      await reload()
    } catch {
      setError(t('set_status_error'))
    } finally {
      setSaving(null)
    }
  }

  return (
    <Section title={t('set_status')}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('set_status_hint')}</div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder={t('status_note_placeholder')}
        rows={2}
        style={{ fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: '100%', resize: 'vertical', fontFamily: 'inherit', marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {STATUSES.map(s => {
          const c = statusColors(s)
          const isCurrent = s === current
          const busy = saving !== null
          return (
            <button
              key={s}
              onClick={() => apply(s)}
              disabled={busy}
              style={{
                fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8,
                cursor: busy ? 'default' : 'pointer',
                border: `1px solid ${isCurrent ? c.fg : 'var(--border-strong)'}`,
                background: isCurrent ? c.bg : 'var(--surface)',
                color: isCurrent ? c.fg : 'var(--text)',
                opacity: busy && saving !== s ? 0.6 : 1,
              }}
            >
              {saving === s ? '…' : t(`status_${s}`)}
            </button>
          )
        })}
      </div>
      {error && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 8 }}>{error}</div>}
    </Section>
  )
}

function DocumentsSection({
  journeyId, documents, primary, light, reload,
}: {
  journeyId: string
  documents: DetailDoc[]
  primary: string
  light: string
  reload: () => Promise<void>
}) {
  const t = useTranslations('jewishness')
  const [docTitle, setDocTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  async function openDoc(docId: string) {
    try {
      const res = await fetch(`/api/jewishness/queue/document/${docId}`)
      if (!res.ok) return
      const b = await res.json() as { url?: string; signed_url?: string; file_url?: string }
      const url = b.signed_url ?? b.file_url ?? b.url
      if (url) window.open(url, '_blank', 'noopener')
    } catch { /* игнор */ }
  }

  async function uploadDoc() {
    if (!file || !docTitle.trim()) return
    setUploading(true); setUploadError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', docTitle.trim())
      const res = await fetch(`/api/jewishness/queue/${journeyId}/document`, { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setUploadError(d.error ?? t('upload_error')); return
      }
      setDocTitle(''); setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await reload()
    } catch {
      setUploadError(t('upload_error'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Section title={t('documents')}>
      {documents.length === 0 ? (
        <div style={muted}>{t('no_documents')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
          {documents.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ color: 'var(--text)' }}>📄 {d.title || d.file_name || d.doc_type}</span>
              <button onClick={() => openDoc(d.id)} style={{ fontSize: 12, fontWeight: 600, color: primary, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {t('open_doc')}
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: light, borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>{t('upload_title')}</div>
        <input
          value={docTitle}
          onChange={e => setDocTitle(e.target.value)}
          placeholder={t('doc_name_placeholder')}
          style={{ fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: '100%' }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            ref={fileRef}
            type="file"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 12, color: 'var(--text)' }}
          />
          <button
            onClick={uploadDoc}
            disabled={uploading || !file || !docTitle.trim()}
            style={{
              fontSize: 13, fontWeight: 600, color: '#fff',
              background: uploading || !file || !docTitle.trim() ? 'var(--text-faint)' : primary,
              border: 'none', borderRadius: 8, padding: '8px 16px',
              cursor: uploading || !file || !docTitle.trim() ? 'default' : 'pointer',
            }}
          >
            {uploading ? t('uploading') : t('upload')}
          </button>
        </div>
        {uploadError && <div style={{ fontSize: 12, color: '#DC2626' }}>{uploadError}</div>}
      </div>
    </Section>
  )
}

function AcceptanceDecisionSection({
  stageInstanceId, finals, sigMethod, primary, reload,
}: {
  stageInstanceId: string
  finals: Final[]
  sigMethod: SignatureMethod
  primary: string
  reload: () => Promise<void>
}) {
  const t = useTranslations('jewishness')
  const tCommon = useTranslations('common')
  const me = useMe()

  const [selectedFinal, setSelectedFinal] = useState<string | null>(null)
  const [sig, setSig] = useState<SignaturePayload | null>(null)
  const [note, setNote] = useState('')
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')

  function finalLabel(f: Final): string {
    if (f.code === 'approved') return t('final_approved')
    if (f.code === 'rejected') return t('final_rejected')
    return f.name_ru
  }

  async function submit() {
    if (!selectedFinal) return
    setSigning(true); setError('')
    try {
      let signatureBody: Record<string, unknown> | undefined
      if (sig) {
        if (sig.kind === 'drawn' && sig.drawing_blob) {
          const fd = new FormData()
          fd.append('file', sig.drawing_blob, 'signature.png')
          const up = await fetch(`/api/workflow/stages/${stageInstanceId}/signature/upload`, { method: 'POST', body: fd })
          if (!up.ok) {
            const d = await up.json().catch(() => ({})) as { error?: string }
            setError(d.error ?? t('sign_error')); return
          }
          const { storage_path } = await up.json() as { storage_path: string }
          signatureBody = { kind: 'drawn', drawing_path: storage_path }
        } else if (sig.kind === 'typed' && sig.typed_name) {
          signatureBody = { kind: 'typed', typed_name: sig.typed_name }
        }
      }

      const rd: Record<string, unknown> = {}
      if (signatureBody) rd.signature = signatureBody
      if (note.trim()) rd.note = note.trim()
      const body: Record<string, unknown> = { final_code: selectedFinal }
      if (Object.keys(rd).length) body.result_data = rd

      const res = await fetch(`/api/workflow/stages/${stageInstanceId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? t('sign_error')); return
      }
      await reload()
    } catch {
      setError(t('sign_error'))
    } finally {
      setSigning(false)
    }
  }

  return (
    <Section title={t('acceptance_title')}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('acceptance_help')}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: selectedFinal ? 12 : 0 }}>
        {finals.map(f => (
          <button
            key={f.id}
            onClick={() => { setSelectedFinal(f.code); setSig(null); setError('') }}
            style={{
              fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${selectedFinal === f.code ? (f.is_positive ? '#059669' : '#DC2626') : 'var(--border-strong)'}`,
              background: selectedFinal === f.code ? (f.is_positive ? '#ECFDF5' : '#FEF2F2') : 'var(--surface)',
              color: selectedFinal === f.code ? (f.is_positive ? '#047857' : '#B91C1C') : 'var(--text)',
            }}
          >
            {finalLabel(f)}
          </button>
        ))}
      </div>

      {selectedFinal && (
        <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--surface-2)', paddingTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t('sign_title')}</div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={`${tCommon('optional_note')} — ${tCommon('note_placeholder')}`}
            rows={2}
            style={{ fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
          />
          <SignatureCapture method={sigMethod} defaultTypedName={me?.full_name ?? undefined} onChange={setSig} />
          {error && <div style={{ fontSize: 12, color: '#DC2626' }}>{error}</div>}
          <button
            onClick={submit}
            disabled={signing || !sig}
            style={{
              justifySelf: 'start', fontSize: 13, fontWeight: 600, color: '#fff',
              background: signing || !sig ? 'var(--text-faint)' : primary,
              border: 'none', borderRadius: 8, padding: '9px 20px',
              cursor: signing || !sig ? 'default' : 'pointer',
            }}
          >
            {signing ? t('signing') : t('confirm')}
          </button>
        </div>
      )}
    </Section>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ fontSize: 13 }}>
      <span style={{ color: 'var(--text-faint)' }}>{label}: </span>
      <span style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  )
}

const muted: React.CSSProperties = { fontSize: 13, color: 'var(--text-faint)' }
