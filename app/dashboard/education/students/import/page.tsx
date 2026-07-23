'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import { parseCsv } from '@/lib/csv-parse'
import { IMPORT_FIELDS, guessField, type ImportField } from '@/lib/education/import-map'

interface RowResult { index: number; name: string; action: 'create' | 'duplicate' | 'error'; message?: string }
interface ImportResult { dry_run: boolean; summary: { total: number; created: number; duplicates: number; errors: number }; results: RowResult[] }

export default function ImportStudentsPage() {
  const t = useTranslations('education.import')
  const tNav = useTranslations('navigation')

  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<number, ImportField | ''>>({})
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState<false | 'check' | 'import'>(false)
  const [error, setError] = useState('')

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(''); setResult(null); setFileName(f.name)
    try {
      const text = await f.text()
      const rows = parseCsv(text)
      if (rows.length < 2) { setError(t('empty_file')); setHeaders([]); setDataRows([]); return }
      const hdr = rows[0]
      setHeaders(hdr)
      setDataRows(rows.slice(1))
      const auto: Record<number, ImportField | ''> = {}
      hdr.forEach((h, i) => { auto[i] = guessField(h) ?? '' })
      setMapping(auto)
    } catch {
      setError(t('load_error'))
    }
  }

  const usedFields = useMemo(() => {
    const s = new Set<ImportField>()
    Object.values(mapping).forEach(f => { if (f) s.add(f) })
    return s
  }, [mapping])
  const hasName = usedFields.has('full_name') || usedFields.has('first_name')

  function buildRows(): Record<string, string>[] {
    return dataRows.map(r => {
      const obj: Record<string, string> = {}
      Object.entries(mapping).forEach(([col, field]) => {
        if (field) { const v = (r[Number(col)] ?? '').trim(); if (v) obj[field] = v }
      })
      return obj
    })
  }

  async function run(dryRun: boolean) {
    if (!hasName) { setError(t('need_name')); return }
    if (!dryRun && !confirm(t('confirm_import'))) return
    setError(''); setLoading(dryRun ? 'check' : 'import')
    try {
      const res = await fetch('/api/education/students/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: buildRows(), dry_run: dryRun }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setError(b.error ?? t('load_error')); return }
      setResult(b as ImportResult)
    } finally { setLoading(false) }
  }

  const previewFields = [...usedFields].filter(f => f !== 'note')
  const preview = buildRows().slice(0, 8)

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '16px 24px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{t('title')}</h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{t('subtitle')}</p>
      </div>

      {/* Step 1: file */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
        <label style={{ display: 'inline-block', padding: '9px 16px', fontSize: 13, fontWeight: 600, color: 'var(--accent-contrast)', background: 'var(--accent)', borderRadius: 8, cursor: 'pointer' }}>
          {t('choose_file')}
          <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
        </label>
        {fileName && <span style={{ fontSize: 13, color: 'var(--text-muted)', marginInlineStart: 10 }}>{fileName} · {t('rows_detected', '{n}').replace('{n}', String(dataRows.length))}</span>}
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 8 }}>{t('file_hint')}</p>
      </div>

      {error && <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>}

      {/* Step 2: mapping */}
      {headers.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 10px' }}>{t('map_heading')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {headers.map((h, i) => (
              <label key={i} style={{ display: 'grid', gap: 3 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h || `#${i + 1}`}</span>
                <select value={mapping[i] ?? ''} onChange={e => setMapping(m => ({ ...m, [i]: e.target.value as ImportField | '' }))}
                  style={{ fontSize: 12.5, padding: '6px 8px', border: `1px solid ${mapping[i] ? 'var(--accent)' : 'var(--border-strong)'}`, borderRadius: 7, background: 'var(--surface)', color: 'var(--text)' }}>
                  <option value="">{t('ignore')}</option>
                  {IMPORT_FIELDS.map(f => <option key={f} value={f}>{t(`field_${f}`)}</option>)}
                </select>
              </label>
            ))}
          </div>
          {!hasName && <div style={{ fontSize: 12.5, color: 'var(--warn)', marginTop: 10 }}>⚠ {t('need_name')}</div>}
        </div>
      )}

      {/* Step 3: preview */}
      {headers.length > 0 && previewFields.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 10px' }}>{t('preview_heading')}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
              <thead>
                <tr>{previewFields.map(f => <th key={f} style={{ textAlign: 'start', padding: '6px 10px', color: 'var(--text-muted)', fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{t(`field_${f}`)}</th>)}</tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {previewFields.map(f => <td key={f} style={{ padding: '6px 10px', color: 'var(--text)', whiteSpace: 'nowrap' }}>{row[f] ?? '·'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={() => run(true)} disabled={loading !== false || !hasName}
              style={{ padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', opacity: (loading !== false || !hasName) ? 0.6 : 1 }}>
              {loading === 'check' ? t('checking') : t('dry_run')}
            </button>
            <button onClick={() => run(false)} disabled={loading !== false || !hasName || !result || result.dry_run === false}
              style={{ padding: '9px 18px', fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: 'pointer', border: 'none', background: 'var(--accent)', color: 'var(--accent-contrast)', opacity: (loading !== false || !hasName || !result || result.dry_run === false) ? 0.5 : 1 }}>
              {loading === 'import' ? t('importing') : t('do_import')}
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 10, marginBottom: 12 }}>
            <Stat label={t('summary_total')} value={result.summary.total} />
            <Stat label={result.dry_run ? t('summary_create') : t('summary_created')} value={result.summary.created} color="var(--success)" />
            <Stat label={t('summary_dup')} value={result.summary.duplicates} color="var(--warn)" />
            <Stat label={t('summary_err')} value={result.summary.errors} color="var(--danger)" />
          </div>
          <div style={{ fontSize: 12.5, color: result.dry_run ? 'var(--text-muted)' : 'var(--success)', marginBottom: 12 }}>
            {result.dry_run ? t('done_dry') : t('done_real')}
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
              <thead>
                <tr>
                  <th style={rh}>{t('col_row')}</th><th style={rh}>{t('col_name')}</th><th style={rh}>{t('col_status')}</th><th style={rh}>{t('col_message')}</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map(r => {
                  const c = r.action === 'error' ? 'var(--danger)' : r.action === 'duplicate' ? 'var(--warn)' : 'var(--success)'
                  const label = r.action === 'error' ? t('act_error') : r.action === 'duplicate' ? t('act_duplicate') : (result.dry_run ? t('act_create') : t('act_created'))
                  return (
                    <tr key={r.index} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={rd}>{r.index + 1}</td>
                      <td style={{ ...rd, fontWeight: 600 }}>{r.name}</td>
                      <td style={{ ...rd, color: c, fontWeight: 700 }}>{label}</td>
                      <td style={{ ...rd, color: 'var(--text-muted)' }}>{r.message ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? 'var(--text)', fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  )
}

const rh: React.CSSProperties = { textAlign: 'start', padding: '7px 10px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface-2)', position: 'sticky', top: 0, whiteSpace: 'nowrap' }
const rd: React.CSSProperties = { padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text)' }
