'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { matchesSponsorSearch, type DonationStats } from '@/lib/sponsors/donations'
import { SPONSOR_TYPES } from '@/lib/sponsors/validation'

interface Sponsor {
  id: string
  name: string
  sponsor_type: string
  email: string | null
  phone: string | null
  address: string | null
  contact_person: string | null
  notes: string | null
  is_active: boolean
  total_received: number
}

interface FormState {
  name: string
  sponsor_type: string
  email: string
  phone: string
  address: string
  contact_person: string
  notes: string
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  name: '', sponsor_type: 'individual', email: '', phone: '',
  address: '', contact_person: '', notes: '', is_active: true,
}

function fmtMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function SponsorsClient({ canManage }: { canManage: boolean }) {
  const router = useRouter()
  const t = useTranslations('sponsors')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const primary = getModuleColor('sponsors', 'primary')
  const light = getModuleColor('sponsors', 'light')

  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [stats, setStats] = useState<DonationStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  // create form: false — закрыт; true — открыт (список — только создание,
  // правка донора живёт в карточке донора).
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/sponsors')
      if (res.status === 403) { setError(t('list.forbidden')); setSponsors([]); setStats(null); return }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('list.load_error')); setSponsors([]); setStats(null); return
      }
      const b = await res.json()
      setSponsors(b.sponsors ?? [])
      setStats(b.stats ?? null)
    } catch {
      setError(t('list.load_error')); setSponsors([]); setStats(null)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let list = sponsors
    if (typeFilter) list = list.filter(s => s.sponsor_type === typeFilter)
    if (search.trim()) list = list.filter(s => matchesSponsorSearch(s, search))
    return list
  }, [sponsors, search, typeFilter])

  function openNew() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setCreating(true)
  }

  function closeForm() {
    setCreating(false)
    setFormError(null)
  }

  async function save() {
    if (!form.name.trim()) { setFormError(t('form.name_required')); return }
    setBusy(true); setFormError(null)
    try {
      const payload = {
        name: form.name.trim(),
        sponsor_type: form.sponsor_type,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        contact_person: form.contact_person.trim() || null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      }
      const res = await fetch('/api/sponsors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setFormError(b.error ?? t('errors.save')); return
      }
      closeForm()
      await load()
    } catch {
      setFormError(t('errors.save'))
    } finally {
      setBusy(false)
    }
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('sponsors'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(217,119,6,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{t('list.subtitle')}</div>
        </div>
        {canManage && (
          <button onClick={openNew} style={{
            fontSize: 13, fontWeight: 600, padding: '8px 16px', border: 'none',
            borderRadius: 8, background: 'var(--surface)', color: primary, cursor: 'pointer',
          }}>
            {t('list.new_sponsor')}
          </button>
        )}
      </div>

      {/* Stats bar */}
      {stats && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12,
        }}>
          <StatCard label={t('stats.total_received')} value={fmtMoney(stats.total_received)} color="#059669" />
          <StatCard label={t('stats.total_pledged')} value={fmtMoney(stats.total_pledged)} color="#D97706" />
          <StatCard label={t('stats.donors')} value={String(sponsors.length)} color="var(--text)" />
        </div>
      )}

      {/* Search + type filter */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('list.search_placeholder')}
          style={{ flex: '1 1 260px', maxWidth: 420, fontSize: 13, padding: '9px 12px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)' }}
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{ fontSize: 13, padding: '9px 12px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', background: 'var(--surface)' }}
        >
          <option value="">{t('list.all_types')}</option>
          {SPONSOR_TYPES.map(tp => (
            <option key={tp} value={tp}>{t(`types.${tp}`)}</option>
          ))}
        </select>
      </div>

      {/* Create form */}
      {canManage && creating && (
        <div style={{ background: 'var(--surface)', border: `1px solid ${primary}`, borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 12px' }}>
            {t('form.new_title')}
          </h2>
          {formError && <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 10 }}>{formError}</div>}
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <Field label={t('fields.name')}>
              <input value={form.name} onChange={e => setField('name', e.target.value)} style={inp} />
            </Field>
            <Field label={t('fields.sponsor_type')}>
              <select value={form.sponsor_type} onChange={e => setField('sponsor_type', e.target.value)} style={inp}>
                {SPONSOR_TYPES.map(tp => (
                  <option key={tp} value={tp}>{t(`types.${tp}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('fields.email')}>
              <input value={form.email} onChange={e => setField('email', e.target.value)} style={inp} />
            </Field>
            <Field label={t('fields.phone')}>
              <input value={form.phone} onChange={e => setField('phone', e.target.value)} style={inp} />
            </Field>
            <Field label={t('fields.contact_person')}>
              <input value={form.contact_person} onChange={e => setField('contact_person', e.target.value)} style={inp} />
            </Field>
            <Field label={t('fields.address')} full>
              <input value={form.address} onChange={e => setField('address', e.target.value)} style={inp} />
            </Field>
            <Field label={t('fields.notes')} full>
              <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} style={area} />
            </Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setField('is_active', e.target.checked)}
            />
            {t('fields.is_active')}
          </label>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={save} disabled={busy} style={btn(primary)}>{tCommon('save')}</button>
            <button onClick={closeForm} disabled={busy} style={btnGhost}>{tCommon('cancel')}</button>
          </div>
        </div>
      )}

      {/* Donors list */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
        {error ? (
          <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
        ) : loading ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
        ) : filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('list.empty')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>{t('list.name')}</th>
                  <th style={th}>{t('list.type')}</th>
                  <th style={th}>{t('list.phone')}</th>
                  <th style={{ ...th, textAlign: 'right' }}>{t('list.received')}</th>
                  <th style={th}>{t('list.status')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/dashboard/sponsors/${s.id}`)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface)' }}
                  >
                    <td style={td}>
                      <div style={{ fontWeight: 500, color: 'var(--text)' }}>{s.name}</div>
                      {s.contact_person && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{s.contact_person}</div>}
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: light, color: '#92400E' }}>
                        {t(`types.${s.sponsor_type}`)}
                      </span>
                    </td>
                    <td style={td}>{s.phone || '—'}</td>
                    <td style={tdNum}>{fmtMoney(s.total_received)}</td>
                    <td style={td}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
                        background: s.is_active ? light : 'var(--surface-2)',
                        color: s.is_active ? '#92400E' : 'var(--text-faint)',
                      }}>
                        {s.is_active ? t('status.active') : t('status.inactive')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
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
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const inp: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', width: '100%', background: 'var(--surface)' }
const area: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', resize: 'vertical', fontFamily: 'inherit', width: '100%' }

function btn(bg: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '7px 16px', border: 'none', borderRadius: 8, background: bg, color: '#fff', cursor: 'pointer' }
}
const btnGhost: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, padding: '7px 16px', border: '1px solid var(--border-strong)',
  borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer',
}
