'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import SignatureCapture, { type SignatureMethod, type SignaturePayload } from '@/components/workflow/SignatureCapture'
import { useMe } from '@/lib/hooks/useMe'

interface DocItem {
  id: string
  doc_type: string
  title: string
  file_name: string | null
  storage_path: string | null
  file_url: string | null
  created_at: string
}
interface Applicant {
  person_id: string | null
  full_name: string
  hebrew_name: string | null
  email: string | null
  phones: string[]
  photo_url: string | null
  birth_date: string | null
  citizenship: string | null
}
interface QueueItem {
  stage_instance_id: string
  activated_at: string | null
  journey_id: string | null
  applicant: Applicant
  documents: DocItem[]
}
interface Final {
  id: string
  code: string
  name_ru: string
  is_positive: boolean
  sort_order: number
}

/**
 * Рабочая очередь бирур-яхадут: абитуриентки на активном этапе jewishness.
 * По каждой — данные, загруженные документы (с загрузкой новых) и подпись
 * заключения. Подпись идёт через общий role-gated /api/workflow/.../complete.
 */
export default function JewishnessListClient() {
  const t = useTranslations('jewishness')
  const primary = getModuleColor('jewishness', 'primary')
  const light = getModuleColor('jewishness', 'light')

  const [items, setItems] = useState<QueueItem[]>([])
  const [finals, setFinals] = useState<Final[]>([])
  const [sigMethod, setSigMethod] = useState<SignatureMethod>('both')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/jewishness')
      if (!res.ok) { setError(t('load_error')); setItems([]); return }
      const b = await res.json()
      setItems(b.items ?? [])
      setFinals(b.finals ?? [])
      setSigMethod((b.signature_method ?? 'both') as SignatureMethod)
    } catch {
      setError(t('load_error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('jewishness'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(202,138,4,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
          {items.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.25)', color: '#fff' }}>
              {items.length} · {t('count_badge')}
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{t('subtitle')}</div>
      </div>

      {/* Body */}
      {error ? (
        <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('loading')}</div>
      ) : items.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, fontSize: 13, color: 'var(--text-faint)' }}>{t('empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map(it => (
            <JewishnessCard
              key={it.stage_instance_id}
              item={it}
              finals={finals}
              sigMethod={sigMethod}
              primary={primary}
              light={light}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function JewishnessCard({
  item, finals, sigMethod, primary, light, onChanged,
}: {
  item: QueueItem
  finals: Final[]
  sigMethod: SignatureMethod
  primary: string
  light: string
  onChanged: () => void
}) {
  const t = useTranslations('jewishness')
  const tCommon = useTranslations('common')
  const me = useMe()

  const [open, setOpen] = useState(false)
  const [selectedFinal, setSelectedFinal] = useState<string | null>(null)
  const [sig, setSig] = useState<SignaturePayload | null>(null)
  const [note, setNote] = useState('')
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')

  // Upload state
  const [docTitle, setDocTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  const a = item.applicant
  const name = a.full_name || a.hebrew_name || '—'

  function finalLabel(f: Final): string {
    if (f.code === 'approved') return t('final_approved')
    if (f.code === 'rejected') return t('final_rejected')
    return f.name_ru
  }

  async function openDoc(docId: string) {
    try {
      const res = await fetch(`/api/jewishness/queue/document/${docId}`)
      if (!res.ok) return
      const { url } = await res.json() as { url?: string }
      if (url) window.open(url, '_blank', 'noopener')
    } catch { /* игнор */ }
  }

  async function uploadDoc() {
    if (!file || !docTitle.trim() || !item.journey_id) return
    setUploading(true); setUploadError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', docTitle.trim())
      const res = await fetch(`/api/jewishness/queue/${item.journey_id}/document`, { method: 'POST', body: fd })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setUploadError(d.error ?? t('upload_error')); return
      }
      setDocTitle(''); setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onChanged()
    } catch {
      setUploadError(t('upload_error'))
    } finally {
      setUploading(false)
    }
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
          const up = await fetch(`/api/workflow/stages/${item.stage_instance_id}/signature/upload`, { method: 'POST', body: fd })
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

      const res = await fetch(`/api/workflow/stages/${item.stage_instance_id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? t('sign_error')); return
      }
      onChanged()
    } finally {
      setSigning(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--surface-2)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {item.documents.length} · {t('documents')}
          </div>
        </div>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: primary, border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {open ? t('hide') : t('open')}
        </button>
      </div>

      {open && (
        <div style={{ padding: 14, display: 'grid', gap: 16 }}>
          {/* Личные данные */}
          <Section title={t('personal_details')}>
            <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              {a.hebrew_name && <Field label={t('personal_details')} value={a.hebrew_name} />}
              {a.email && <Field label={t('email')} value={a.email} />}
              {a.phones.length > 0 && <Field label={t('phone')} value={a.phones.join(', ')} />}
              {a.birth_date && <Field label={t('birth_date')} value={a.birth_date} />}
              {a.citizenship && <Field label={t('citizenship')} value={a.citizenship} />}
            </div>
          </Section>

          {/* Документы + загрузка */}
          <Section title={t('documents')}>
            {item.documents.length === 0 ? (
              <div style={muted}>{t('no_documents')}</div>
            ) : (
              <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
                {item.documents.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span style={{ color: 'var(--text)' }}>📄 {d.title || d.file_name || d.doc_type}</span>
                    {(d.storage_path || d.file_url) && (
                      <button onClick={() => openDoc(d.id)} style={{ fontSize: 12, fontWeight: 600, color: primary, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        {t('open_doc')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Форма загрузки */}
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

          {/* Решение + подпись */}
          <Section title={t('decision')}>
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
        </div>
      )}
    </div>
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
