'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { isExpired, isExpiringSoon } from '@/lib/documents/expiry'
import { DOC_TYPES } from '@/lib/documents/validation'

/**
 * Journey-scoped панель документов для карточки лида/абитуриента/студента.
 *
 * В отличие от person-scoped DocumentsTab (чек-лист типов), эта панель работает
 * с document_records по journey_id: рекрутёр задаёт тип (напр. «Паспорт»),
 * выбирает файл и загружает его в приватное хранилище. Загруженные документы
 * видны на этапах врача/психолога/проверки еврейства (их очереди читают
 * document_records по journey_id). Гружёт только реальный файл (multipart) —
 * поэтому использует только эндпоинты, открытые для education-персонала:
 * GET /api/documents/journeys/[id], POST …/upload, GET …/[id]/signed-url,
 * DELETE …/[id].
 */

interface Doc {
  id: string
  doc_type: string
  title: string
  issued_date: string | null
  expiry_date: string | null
  file_url: string | null
  storage_path: string | null
  file_name: string | null
  status: 'active' | 'archived'
  notes: string | null
}

interface Props {
  journeyId: string
  canManage: boolean
}

export default function JourneyDocumentsPanel({ journeyId, canManage }: Props) {
  const t = useTranslations('documents')
  const tCommon = useTranslations('common')

  const today = new Date().toISOString().slice(0, 10)

  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // add-document form
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [dType, setDType] = useState<string>('passport')
  const [dTitle, setDTitle] = useState('')
  const [dIssued, setDIssued] = useState('')
  const [dExpiry, setDExpiry] = useState('')
  const [dNotes, setDNotes] = useState('')
  const [dFile, setDFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0) // remount file input to clear it after upload

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/documents/journeys/${journeyId}`)
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('errors.load')); return
      }
      const b = await res.json()
      setDocs(b.documents ?? [])
    } catch {
      setError(t('errors.load'))
    } finally {
      setLoading(false)
    }
  }, [journeyId, t])

  useEffect(() => { load() }, [load])

  async function addDocument() {
    if (!dTitle.trim()) { setFormError(t('errors.title_required')); return }
    if (!dFile) { setFormError(t('fields.upload_file')); return }
    setBusy(true); setFormError(null)
    try {
      const fd = new FormData()
      fd.append('file', dFile)
      fd.append('title', dTitle.trim())
      fd.append('doc_type', dType)
      if (dIssued) fd.append('issued_date', dIssued)
      if (dExpiry) fd.append('expiry_date', dExpiry)
      if (dNotes) fd.append('notes', dNotes)
      const res = await fetch(`/api/documents/journeys/${journeyId}/upload`, { method: 'POST', body: fd })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setFormError(b.error ?? t('errors.add')); return
      }
      setDType('passport'); setDTitle(''); setDIssued(''); setDExpiry(''); setDNotes('')
      setDFile(null); setFileKey(k => k + 1)
      await load()
    } catch {
      setFormError(t('errors.add'))
    } finally {
      setBusy(false)
    }
  }

  // Открывает файл документа по свежей подписанной ссылке (или внешнему URL).
  async function openDoc(d: Doc) {
    setError(null)
    try {
      const res = await fetch(`/api/documents/${d.id}/signed-url`)
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('errors.action')); return
      }
      const b = await res.json()
      if (b.url) window.open(b.url, '_blank', 'noopener,noreferrer')
    } catch {
      setError(t('errors.action'))
    }
  }

  async function remove(d: Doc) {
    if (!confirm(t('delete_confirm'))) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/documents/${d.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('errors.action')); return
      }
      await load()
    } catch {
      setError(t('errors.action'))
    } finally {
      setBusy(false)
    }
  }

  function expiryColor(d: Doc): string {
    if (isExpired(d, today)) return '#B91C1C'
    if (isExpiringSoon(d, today)) return '#B45309'
    return 'var(--text)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : (
        <>
          {/* Add document */}
          {canManage && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                {t('add.title')}
              </div>
              {formError && <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 10 }}>{formError}</div>}
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <Field label={t('fields.doc_type')}>
                  <select value={dType} onChange={e => setDType(e.target.value)} style={inp}>
                    {DOC_TYPES.map(tp => (
                      <option key={tp} value={tp}>{t(`types.${tp}`)}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('fields.title')}>
                  <input value={dTitle} onChange={e => setDTitle(e.target.value)} style={inp} />
                </Field>
                <Field label={t('fields.issued_date')}>
                  <input type="date" value={dIssued} onChange={e => setDIssued(e.target.value)} style={inp} />
                </Field>
                <Field label={t('fields.expiry_date')}>
                  <input type="date" value={dExpiry} onChange={e => setDExpiry(e.target.value)} style={inp} />
                </Field>
                <Field label={t('fields.upload_file')} full>
                  <input
                    key={fileKey}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                    onChange={e => setDFile(e.target.files?.[0] ?? null)}
                    style={inp}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', fontWeight: 400 }}>{t('fields.upload_hint')}</span>
                </Field>
                <Field label={t('fields.notes')} full>
                  <textarea value={dNotes} onChange={e => setDNotes(e.target.value)} rows={2} style={area} />
                </Field>
              </div>
              <div style={{ marginTop: 12 }}>
                <button onClick={addDocument} disabled={busy} style={btn}>{t('add.submit')}</button>
              </div>
            </div>
          )}

          {/* Document list */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              {t('registry.title')}
            </div>
            {docs.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-faint)', fontStyle: 'italic' }}>{t('registry.empty')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {docs.map(d => (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '8px 12px', borderRadius: 8,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t(`types.${d.doc_type}`)}</span>
                        {(d.storage_path || d.file_url) ? (
                          <button onClick={() => openDoc(d)} style={linkBtn('var(--accent)')}>{d.title}</button>
                        ) : (
                          <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{d.title}</span>
                        )}
                      </div>
                      {d.file_name && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>📎 {d.file_name}</div>}
                      {d.expiry_date && (
                        <div style={{ fontSize: 11, color: expiryColor(d), fontWeight: (isExpired(d, today) || isExpiringSoon(d, today)) ? 600 : 400 }}>
                          {t('fields.expiry_date')}: {d.expiry_date}
                          {isExpired(d, today) && <span style={{ marginInlineStart: 6 }}>{t('list.expired_flag')}</span>}
                          {isExpiringSoon(d, today) && <span style={{ marginInlineStart: 6 }}>{t('list.expiring_flag')}</span>}
                        </div>
                      )}
                      {d.notes && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.notes}</div>}
                    </div>
                    {canManage && (
                      <button onClick={() => remove(d)} disabled={busy} style={linkBtn('#DC2626')}>{tCommon('delete')}</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'grid', gap: 4, gridColumn: full ? '1 / -1' : undefined }}>
      {label}
      {children}
    </label>
  )
}

const inp: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', width: '100%' }
const area: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', resize: 'vertical', fontFamily: 'inherit', width: '100%' }
const btn: React.CSSProperties = { fontSize: 13, fontWeight: 600, padding: '7px 16px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: '#fff', cursor: 'pointer' }

function linkBtn(color: string): React.CSSProperties {
  return { background: 'none', border: 'none', color, cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: '0 4px' }
}
