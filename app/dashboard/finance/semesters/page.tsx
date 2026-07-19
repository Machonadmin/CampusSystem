'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'

interface Semester {
  id: string
  year_label: string
  term_number: number
  name: string | null
  price: number
  status: 'open' | 'closed'
  created_at: string
}

function fmtMoney(n: number) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export default function SemestersPage() {
  const t = useTranslations('finance.semesters')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const [semesters, setSemesters] = useState<Semester[]>([])
  const [defaultPrice, setDefaultPrice] = useState(210000)
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // create form
  const [creating, setCreating] = useState(false)
  const [fYear, setFYear] = useState('')
  const [fTerm, setFTerm] = useState('')
  const [fName, setFName] = useState('')
  const [fPrice, setFPrice] = useState('')
  const [saving, setSaving] = useState(false)

  const primary = getModuleColor('finance', 'primary')

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch('/api/finance/semesters')
      if (res.status === 403) { setErr(t('forbidden')); return }
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('load_failed')); return }
      const b = await res.json()
      setSemesters(b.semesters ?? [])
      setDefaultPrice(b.default_price ?? 210000)
      setCanManage(!!b.can_manage)
    } catch { setErr(t('load_failed')) } finally { setLoading(false) }
  }, [t])
  useEffect(() => { load() }, [load])

  async function createSemester() {
    if (!fYear.trim() || !fTerm.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/finance/semesters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year_label: fYear.trim(),
          term_number: Number(fTerm),
          name: fName.trim() || null,
          price: fPrice.trim() ? Number(fPrice) : undefined,
        }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { toast(b.error ?? t('save_failed'), 'error'); return }
      setCreating(false); setFYear(''); setFTerm(''); setFName(''); setFPrice('')
      await load()
    } catch { toast(t('save_failed'), 'error') } finally { setSaving(false) }
  }

  async function updatePrice(s: Semester, value: string) {
    const price = Number(value)
    if (!Number.isFinite(price) || price < 0) return
    const res = await fetch(`/api/finance/semesters/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ price }),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})); toast(b.error ?? t('save_failed'), 'error'); return }
    setSemesters(prev => prev.map(x => x.id === s.id ? { ...x, price } : x))
  }

  async function toggleStatus(s: Semester) {
    const status = s.status === 'open' ? 'closed' : 'open'
    const res = await fetch(`/api/finance/semesters/${s.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})); toast(b.error ?? t('save_failed'), 'error'); return }
    setSemesters(prev => prev.map(x => x.id === s.id ? { ...x, status } : x))
  }

  async function generate(s: Semester) {
    if (!window.confirm(t('generate_confirm').replace('{name}', s.name || `${s.year_label} · ${s.term_number}`))) return
    setBusyId(s.id)
    try {
      const res = await fetch(`/api/finance/semesters/${s.id}/generate`, { method: 'POST' })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { toast(b.error ?? t('generate_failed'), 'error'); return }
      toast(t('generate_result').replace('{created}', String(b.created ?? 0)).replace('{skipped}', String(b.skipped ?? 0)), 'success')
    } catch { toast(t('generate_failed'), 'error') } finally { setBusyId(null) }
  }

  const inp: React.CSSProperties = { fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', background: 'var(--surface)' }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('finance'), href: '/dashboard/finance' },
        { label: t('title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('finance'), borderRadius: 12, padding: '16px 24px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{t('subtitle')}</div>
        </div>
        {canManage && (
          <button onClick={() => setCreating(v => !v)} style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', border: 'none', borderRadius: 8, background: 'var(--surface)', color: primary, cursor: 'pointer' }}>
            {creating ? tCommon('cancel') : t('add')}
          </button>
        )}
      </div>

      {creating && canManage && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <Field label={t('f_year')}><input style={{ ...inp, width: 110 }} value={fYear} onChange={e => setFYear(e.target.value)} placeholder="2026" /></Field>
          <Field label={t('f_term')}><input style={{ ...inp, width: 90 }} type="number" min="1" value={fTerm} onChange={e => setFTerm(e.target.value)} placeholder="1" /></Field>
          <Field label={t('f_name')}><input style={{ ...inp, width: 180 }} value={fName} onChange={e => setFName(e.target.value)} placeholder={t('f_name_ph')} /></Field>
          <Field label={t('f_price')}><input style={{ ...inp, width: 140 }} type="number" min="0" value={fPrice} onChange={e => setFPrice(e.target.value)} placeholder={fmtMoney(defaultPrice)} /></Field>
          <button onClick={createSemester} disabled={saving || !fYear.trim() || !fTerm.trim()} style={{ fontSize: 13, fontWeight: 600, padding: '9px 16px', border: 'none', borderRadius: 8, background: primary, color: '#fff', cursor: saving ? 'default' : 'pointer', opacity: saving || !fYear.trim() || !fTerm.trim() ? 0.6 : 1 }}>{tCommon('save')}</button>
        </div>
      )}

      {err && <div style={{ fontSize: 13, color: '#DC2626' }}>{err}</div>}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : semesters.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14, background: 'var(--surface)', border: '1px dashed var(--border-strong)', borderRadius: 10 }}>{t('empty')}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {semesters.map(s => (
            <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 16, opacity: s.status === 'closed' ? 0.65 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{s.name || `${s.year_label} · ${t('term_n').replace('{n}', String(s.term_number))}`}</div>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: s.status === 'open' ? '#D1FAE5' : 'var(--surface-2)', color: s.status === 'open' ? '#065F46' : 'var(--text-muted)' }}>
                  {t(`status_${s.status}`)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.year_label} · {t('term_n').replace('{n}', String(s.term_number))}</div>

              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('f_price')}</label>
                {canManage ? (
                  <input
                    defaultValue={String(s.price)} type="number" min="0"
                    onBlur={e => { if (Number(e.target.value) !== Number(s.price)) updatePrice(s, e.target.value) }}
                    style={{ ...inp, width: '100%' }}
                  />
                ) : (
                  <div style={{ fontSize: 15, fontWeight: 700, color: primary }}>{fmtMoney(s.price)}</div>
                )}
              </div>

              {canManage && (
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => generate(s)} disabled={busyId === s.id}
                    style={{ flex: 1, fontSize: 12.5, fontWeight: 600, padding: '8px 10px', border: 'none', borderRadius: 8, background: primary, color: '#fff', cursor: busyId === s.id ? 'default' : 'pointer', opacity: busyId === s.id ? 0.6 : 1 }}
                  >
                    {busyId === s.id ? '…' : t('generate')}
                  </button>
                  <button onClick={() => toggleStatus(s)} style={{ fontSize: 12.5, fontWeight: 600, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
                    {s.status === 'open' ? t('close') : t('reopen')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.6 }}>{t('generate_hint')}</div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  )
}
