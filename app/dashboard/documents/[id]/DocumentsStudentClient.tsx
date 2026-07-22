'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { RowActionsMenu } from '@/components/ui/RowActionsMenu'
import { isExpired, isExpiringSoon } from '@/lib/documents/expiry'
import { DOC_TYPES } from '@/lib/documents/validation'

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
  studentName: string
  canManage: boolean
}

export default function DocumentsStudentClient({ journeyId, studentName, canManage }: Props) {
  const t = useTranslations('documents')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const primary = getModuleColor('documents', 'primary')
  const light = getModuleColor('documents', 'light')
  const today = new Date().toISOString().slice(0, 10)

  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // add-document form
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [dType, setDType] = useState<string>('other')
  const [dTitle, setDTitle] = useState('')
  const [dIssued, setDIssued] = useState('')
  const [dExpiry, setDExpiry] = useState('')
  const [dFileUrl, setDFileUrl] = useState('')
  const [dNotes, setDNotes] = useState('')
  const [dFile, setDFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0) // remount the file input to clear it after upload

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
    setBusy(true); setFormError(null)
    try {
      let res: Response
      if (dFile) {
        // Real file upload → multipart to the storage-backed endpoint.
        const fd = new FormData()
        fd.append('file', dFile)
        fd.append('title', dTitle.trim())
        fd.append('doc_type', dType)
        if (dIssued) fd.append('issued_date', dIssued)
        if (dExpiry) fd.append('expiry_date', dExpiry)
        if (dNotes) fd.append('notes', dNotes)
        res = await fetch(`/api/documents/journeys/${journeyId}/upload`, { method: 'POST', body: fd })
      } else {
        // No file chosen → keep the external-link path.
        res = await fetch(`/api/documents/journeys/${journeyId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doc_type: dType,
            title: dTitle.trim(),
            issued_date: dIssued || null,
            expiry_date: dExpiry || null,
            file_url: dFileUrl || null,
            notes: dNotes || null,
          }),
        })
      }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setFormError(b.error ?? t('errors.add')); return
      }
      setDType('other'); setDTitle(''); setDIssued(''); setDExpiry(''); setDFileUrl(''); setDNotes('')
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

  async function setStatus(d: Doc, status: 'active' | 'archived') {
    const confirmMsg = status === 'archived' ? t('archive_confirm') : t('unarchive_confirm')
    if (!confirm(confirmMsg)) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/documents/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
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
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title'), href: '/dashboard/documents' },
        { label: studentName },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('documents'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(107,114,128,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{studentName}</h1>
        <Link href="/dashboard/documents" style={{ fontSize: 13, color: '#fff', opacity: 0.9, textDecoration: 'underline' }}>
          {tCommon('back')}
        </Link>
      </div>

      {error && <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>}
      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : (
        <>
          {/* Add document */}
          {canManage && (
            <div style={{ background: 'var(--surface)', border: `1px solid ${primary}`, borderRadius: 12, padding: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>{t('add.title')}</h2>
              {formError && <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 10 }}>{formError}</div>}
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
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
                <Field label={t('fields.file_url')} full>
                  <input
                    value={dFileUrl}
                    onChange={e => setDFileUrl(e.target.value)}
                    placeholder="https://"
                    disabled={!!dFile}
                    style={{ ...inp, opacity: dFile ? 0.5 : 1 }}
                  />
                </Field>
                <Field label={t('fields.notes')} full>
                  <textarea value={dNotes} onChange={e => setDNotes(e.target.value)} rows={2} style={area} />
                </Field>
              </div>
              <div style={{ marginTop: 12 }}>
                <button onClick={addDocument} disabled={busy} style={btn(primary)}>{t('add.submit')}</button>
              </div>
            </div>
          )}

          {/* Document list */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>{t('registry.title')}</h2>
            {docs.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('registry.empty')}</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {[t('fields.doc_type'), t('fields.title'), t('fields.issued_date'), t('fields.expiry_date'), t('fields.status'), ''].map((h, i) => (
                        <th key={i} style={th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map(d => (
                      <tr key={d.id}>
                        <td style={td}>{t(`types.${d.doc_type}`)}</td>
                        <td style={td}>
                          {d.storage_path ? (
                            <button onClick={() => openDoc(d)} style={{ ...linkBtn(primary), padding: 0, fontSize: 13 }}>{d.title}</button>
                          ) : d.file_url ? (
                            <a href={d.file_url} target="_blank" rel="noreferrer" style={{ color: primary, fontWeight: 500 }}>{d.title}</a>
                          ) : (
                            <span style={{ fontWeight: 500 }}>{d.title}</span>
                          )}
                          {d.file_name && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>📎 {d.file_name}</div>}
                          {d.notes && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.notes}</div>}
                        </td>
                        <td style={td}>{d.issued_date || '—'}</td>
                        <td style={{ ...td, color: expiryColor(d), fontWeight: (isExpired(d, today) || isExpiringSoon(d, today)) ? 600 : 400 }}>
                          {d.expiry_date || '—'}
                          {isExpired(d, today) && <span style={{ fontSize: 10, marginInlineStart: 6 }}>{t('list.expired_flag')}</span>}
                          {isExpiringSoon(d, today) && <span style={{ fontSize: 10, marginInlineStart: 6 }}>{t('list.expiring_flag')}</span>}
                        </td>
                        <td style={td}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
                            background: d.status === 'active' ? light : 'var(--surface-2)',
                            color: d.status === 'active' ? 'var(--text-muted)' : 'var(--text-faint)',
                          }}>
                            {t(`status.${d.status}`)}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {canManage && (
                            <RowActionsMenu
                              accentColor={primary}
                              actions={[
                                { key: 'archive', label: t('archive'), onClick: () => setStatus(d, 'archived'), disabled: busy, hidden: d.status !== 'active' },
                                { key: 'unarchive', label: t('unarchive'), onClick: () => setStatus(d, 'active'), disabled: busy, hidden: d.status !== 'archived' },
                                { key: 'delete', label: tCommon('delete'), onClick: () => remove(d), disabled: busy, danger: true },
                              ]}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

const th: React.CSSProperties = {
  textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)',
  textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 12px',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { fontSize: 13, color: 'var(--text)', padding: '9px 12px', borderBottom: '1px solid var(--surface-2)' }
const inp: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', width: '100%' }
const area: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', resize: 'vertical', fontFamily: 'inherit', width: '100%' }

function btn(bg: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '7px 16px', border: 'none', borderRadius: 8, background: bg, color: '#fff', cursor: 'pointer' }
}
function linkBtn(color: string): React.CSSProperties {
  return { background: 'none', border: 'none', color, cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '2px 6px' }
}
