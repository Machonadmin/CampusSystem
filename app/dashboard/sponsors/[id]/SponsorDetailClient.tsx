'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { DONATION_STATUSES, SPONSOR_TYPES } from '@/lib/sponsors/validation'
import type { DonationStats } from '@/lib/sponsors/donations'
import type { SponsorRow } from '@/types/database'

interface Donation {
  id: string
  sponsor_id: string
  amount: number
  donation_date: string
  purpose: string | null
  campaign: string | null
  method: string | null
  status: 'pledged' | 'received' | 'cancelled'
  notes: string | null
}

interface DonationForm {
  amount: string
  donation_date: string
  purpose: string
  campaign: string
  method: string
  status: string
}

const EMPTY_DONATION: DonationForm = {
  amount: '', donation_date: '', purpose: '', campaign: '', method: '', status: 'pledged',
}

interface SponsorForm {
  name: string
  sponsor_type: string
  email: string
  phone: string
  address: string
  contact_person: string
  notes: string
  is_active: boolean
}

function fmtMoney(n: number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function SponsorDetailClient({
  sponsor: initialSponsor, canManage,
}: {
  sponsor: SponsorRow
  canManage: boolean
}) {
  const router = useRouter()
  const t = useTranslations('sponsors')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const primary = getModuleColor('sponsors', 'primary')
  const light = getModuleColor('sponsors', 'light')

  const [sponsor, setSponsor] = useState<SponsorRow>(initialSponsor)

  const [donations, setDonations] = useState<Donation[]>([])
  const [stats, setStats] = useState<DonationStats | null>(null)
  const [campaigns, setCampaigns] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // donation editor: null — закрыт; '' — новое пожертвование; иначе id
  const [donationEditing, setDonationEditing] = useState<string | null>(null)
  const [dForm, setDForm] = useState<DonationForm>(EMPTY_DONATION)
  const [dFormError, setDFormError] = useState<string | null>(null)

  // sponsor editor
  const [editingSponsor, setEditingSponsor] = useState(false)
  const [sForm, setSForm] = useState<SponsorForm>(toSponsorForm(initialSponsor))
  const [sFormError, setSFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/sponsors/${sponsor.id}/donations`)
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('detail.load_error')); return
      }
      const b = await res.json()
      setDonations(b.donations ?? [])
      setStats(b.stats ?? null)
      setCampaigns(b.campaigns ?? {})
    } catch {
      setError(t('detail.load_error'))
    } finally {
      setLoading(false)
    }
  }, [sponsor.id, t])

  useEffect(() => { load() }, [load])

  // ── donation mutations ──────────────────────────────────────────────────────

  function openNewDonation() {
    setDForm(EMPTY_DONATION)
    setDFormError(null)
    setDonationEditing('')
  }

  function openEditDonation(d: Donation) {
    if (!canManage) return
    setDForm({
      amount: String(d.amount),
      donation_date: d.donation_date,
      purpose: d.purpose ?? '',
      campaign: d.campaign ?? '',
      method: d.method ?? '',
      status: d.status,
    })
    setDFormError(null)
    setDonationEditing(d.id)
  }

  function closeDonation() {
    setDonationEditing(null)
    setDFormError(null)
  }

  async function saveDonation() {
    if (!dForm.amount.trim() || !dForm.donation_date) { setDFormError(t('form.required')); return }
    const amount = Number(dForm.amount)
    if (!Number.isFinite(amount) || amount < 0) { setDFormError(t('form.amount_invalid')); return }
    setBusy(true); setDFormError(null)
    try {
      const payload = {
        amount,
        donation_date: dForm.donation_date,
        purpose: dForm.purpose.trim() || null,
        campaign: dForm.campaign.trim() || null,
        method: dForm.method.trim() || null,
        status: dForm.status,
      }
      const res = donationEditing === ''
        ? await fetch(`/api/sponsors/${sponsor.id}/donations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/sponsors/donations/${donationEditing}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setDFormError(b.error ?? t('errors.save')); return
      }
      closeDonation()
      await load()
    } catch {
      setDFormError(t('errors.save'))
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(d: Donation, status: string) {
    setBusy(true); setActionError(null)
    try {
      const res = await fetch(`/api/sponsors/donations/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setActionError(b.error ?? t('errors.action')); return
      }
      await load()
    } catch {
      setActionError(t('errors.action'))
    } finally {
      setBusy(false)
    }
  }

  // ── sponsor mutations ───────────────────────────────────────────────────────

  function openEditSponsor() {
    setSForm(toSponsorForm(sponsor))
    setSFormError(null)
    setEditingSponsor(true)
  }

  async function saveSponsor() {
    if (!sForm.name.trim()) { setSFormError(t('form.name_required')); return }
    setBusy(true); setSFormError(null)
    try {
      const payload = {
        name: sForm.name.trim(),
        sponsor_type: sForm.sponsor_type,
        email: sForm.email.trim() || null,
        phone: sForm.phone.trim() || null,
        address: sForm.address.trim() || null,
        contact_person: sForm.contact_person.trim() || null,
        notes: sForm.notes.trim() || null,
        is_active: sForm.is_active,
      }
      const res = await fetch(`/api/sponsors/${sponsor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setSFormError(b.error ?? t('errors.save')); return
      }
      const updated = await res.json()
      setSponsor(updated as SponsorRow)
      setEditingSponsor(false)
    } catch {
      setSFormError(t('errors.save'))
    } finally {
      setBusy(false)
    }
  }

  async function removeSponsor() {
    if (!confirm(t('detail.delete_confirm'))) return
    setBusy(true); setSFormError(null)
    try {
      const res = await fetch(`/api/sponsors/${sponsor.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setSFormError(b.error ?? t('errors.action')); return
      }
      router.push('/dashboard/sponsors')
    } catch {
      setSFormError(t('errors.action'))
    } finally {
      setBusy(false)
    }
  }

  function setD<K extends keyof DonationForm>(key: K, value: DonationForm[K]) {
    setDForm(f => ({ ...f, [key]: value }))
  }
  function setS<K extends keyof SponsorForm>(key: K, value: SponsorForm[K]) {
    setSForm(f => ({ ...f, [key]: value }))
  }

  const campaignEntries = Object.entries(campaigns)

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title'), href: '/dashboard/sponsors' },
        { label: sponsor.name },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('sponsors'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(217,119,6,0.15)',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{sponsor.name}</h1>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
            {t(`types.${sponsor.sponsor_type}`)}
            {!sponsor.is_active && <> · {t('status.inactive')}</>}
          </div>
        </div>
        <Link href="/dashboard/sponsors" style={{ fontSize: 13, color: '#fff', opacity: 0.9, textDecoration: 'underline' }}>
          {tCommon('back')}
        </Link>
      </div>

      {/* Sponsor details / editor */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>{t('detail.sponsor_info')}</h2>
          {canManage && !editingSponsor && (
            <button onClick={openEditSponsor} style={outlineBtn(primary)}>{tCommon('edit')}</button>
          )}
        </div>

        {editingSponsor ? (
          <>
            {sFormError && <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 10 }}>{sFormError}</div>}
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <Field label={t('fields.name')}>
                <input value={sForm.name} onChange={e => setS('name', e.target.value)} style={inp} />
              </Field>
              <Field label={t('fields.sponsor_type')}>
                <select value={sForm.sponsor_type} onChange={e => setS('sponsor_type', e.target.value)} style={inp}>
                  {SPONSOR_TYPES.map(tp => <option key={tp} value={tp}>{t(`types.${tp}`)}</option>)}
                </select>
              </Field>
              <Field label={t('fields.email')}>
                <input value={sForm.email} onChange={e => setS('email', e.target.value)} style={inp} />
              </Field>
              <Field label={t('fields.phone')}>
                <input value={sForm.phone} onChange={e => setS('phone', e.target.value)} style={inp} />
              </Field>
              <Field label={t('fields.contact_person')}>
                <input value={sForm.contact_person} onChange={e => setS('contact_person', e.target.value)} style={inp} />
              </Field>
              <Field label={t('fields.address')} full>
                <input value={sForm.address} onChange={e => setS('address', e.target.value)} style={inp} />
              </Field>
              <Field label={t('fields.notes')} full>
                <textarea value={sForm.notes} onChange={e => setS('notes', e.target.value)} rows={2} style={area} />
              </Field>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
              <input type="checkbox" checked={sForm.is_active} onChange={e => setS('is_active', e.target.checked)} />
              {t('fields.is_active')}
            </label>
            <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={saveSponsor} disabled={busy} style={btn(primary)}>{tCommon('save')}</button>
              <button onClick={() => setEditingSponsor(false)} disabled={busy} style={btnGhost}>{tCommon('cancel')}</button>
              <button onClick={removeSponsor} disabled={busy} style={{ ...btnGhost, color: '#DC2626', borderColor: '#FCA5A5', marginInlineStart: 'auto' }}>
                {tCommon('delete')}
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <InfoRow label={t('fields.email')} value={sponsor.email} />
            <InfoRow label={t('fields.phone')} value={sponsor.phone} />
            <InfoRow label={t('fields.contact_person')} value={sponsor.contact_person} />
            <InfoRow label={t('fields.address')} value={sponsor.address} />
            <InfoRow label={t('fields.notes')} value={sponsor.notes} />
          </div>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <TotalCard label={t('stats.total_received')} value={fmtMoney(stats.total_received)} color="#059669" />
          <TotalCard label={t('stats.total_pledged')} value={fmtMoney(stats.total_pledged)} color="#D97706" />
          <TotalCard label={t('stats.total_cancelled')} value={fmtMoney(stats.total_cancelled)} color="#9CA3AF" />
        </div>
      )}

      {/* Campaign breakdown (received) */}
      {campaignEntries.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '12px 16px',
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('detail.campaigns')}
          </span>
          {campaignEntries.map(([name, total]) => (
            <span key={name} style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: light, color: '#92400E' }}>
              {name} · {fmtMoney(total)}
            </span>
          ))}
        </div>
      )}

      {actionError && <div style={{ fontSize: 13, color: '#DC2626' }}>{actionError}</div>}

      {/* Donations */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>{t('detail.donations_section')}</h2>
          {canManage && (
            <button onClick={openNewDonation} style={outlineBtn(primary)}>+ {t('detail.record_donation')}</button>
          )}
        </div>

        {/* Donation editor */}
        {canManage && donationEditing !== null && (
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 10 }}>
              {donationEditing === '' ? t('detail.record_donation') : t('detail.edit_donation')}
            </div>
            {dFormError && <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 10 }}>{dFormError}</div>}
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <Field label={t('fields.amount')}>
                <input type="number" step="0.01" min="0" value={dForm.amount} onChange={e => setD('amount', e.target.value)} style={inp} />
              </Field>
              <Field label={t('fields.donation_date')}>
                <input type="date" value={dForm.donation_date} onChange={e => setD('donation_date', e.target.value)} style={inp} />
              </Field>
              <Field label={t('fields.status')}>
                <select value={dForm.status} onChange={e => setD('status', e.target.value)} style={inp}>
                  {DONATION_STATUSES.map(st => <option key={st} value={st}>{t(`statuses.${st}`)}</option>)}
                </select>
              </Field>
              <Field label={t('fields.purpose')}>
                <input value={dForm.purpose} onChange={e => setD('purpose', e.target.value)} style={inp} />
              </Field>
              <Field label={t('fields.campaign')}>
                <input value={dForm.campaign} onChange={e => setD('campaign', e.target.value)} style={inp} />
              </Field>
              <Field label={t('fields.method')}>
                <input value={dForm.method} onChange={e => setD('method', e.target.value)} style={inp} />
              </Field>
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={saveDonation} disabled={busy} style={btn(primary)}>{tCommon('save')}</button>
              <button onClick={closeDonation} disabled={busy} style={btnGhost}>{tCommon('cancel')}</button>
            </div>
          </div>
        )}

        {error ? (
          <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
        ) : loading ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>{tCommon('loading')}</div>
        ) : donations.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>{t('detail.no_donations')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>{t('detail.col_date')}</th>
                  <th style={{ ...th, textAlign: 'right' }}>{t('detail.col_amount')}</th>
                  <th style={th}>{t('detail.col_purpose')}</th>
                  <th style={th}>{t('detail.col_campaign')}</th>
                  <th style={th}>{t('detail.col_method')}</th>
                  <th style={th}>{t('detail.col_status')}</th>
                  {canManage && <th style={{ ...th, textAlign: 'right' }}></th>}
                </tr>
              </thead>
              <tbody>
                {donations.map(d => (
                  <tr key={d.id}>
                    <td style={td}>{d.donation_date}</td>
                    <td style={tdNum}>{fmtMoney(d.amount)}</td>
                    <td style={td}>{d.purpose || '—'}</td>
                    <td style={td}>{d.campaign || '—'}</td>
                    <td style={td}>{d.method || '—'}</td>
                    <td style={td}><StatusBadge status={d.status} label={t(`statuses.${d.status}`)} /></td>
                    {canManage && (
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {d.status !== 'received' && (
                          <ActionLink onClick={() => changeStatus(d, 'received')} disabled={busy} color="#059669">{t('detail.mark_received')}</ActionLink>
                        )}
                        {d.status !== 'cancelled' && (
                          <ActionLink onClick={() => changeStatus(d, 'cancelled')} disabled={busy} color="#D97706">{t('detail.mark_cancelled')}</ActionLink>
                        )}
                        <ActionLink onClick={() => openEditDonation(d)} disabled={busy} color={primary}>{tCommon('edit')}</ActionLink>
                      </td>
                    )}
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

// ── helpers ────────────────────────────────────────────────────────────────────

function toSponsorForm(s: SponsorRow): SponsorForm {
  return {
    name: s.name,
    sponsor_type: s.sponsor_type,
    email: s.email ?? '',
    phone: s.phone ?? '',
    address: s.address ?? '',
    contact_person: s.contact_person ?? '',
    notes: s.notes ?? '',
    is_active: s.is_active,
  }
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#1F2937', marginTop: 2 }}>{value || '—'}</div>
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'grid', gap: 4, gridColumn: full ? '1 / -1' : undefined }}>
      {label}
      {children}
    </label>
  )
}

function TotalCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function StatusBadge({ status, label }: { status: 'pledged' | 'received' | 'cancelled'; label: string }) {
  const palette: Record<string, { bg: string; fg: string }> = {
    received:  { bg: '#D1FAE5', fg: '#047857' },
    pledged:   { bg: '#FEF3C7', fg: '#B45309' },
    cancelled: { bg: '#F3F4F6', fg: '#6B7280' },
  }
  const c = palette[status] ?? palette.cancelled
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 9px',
      borderRadius: 999, background: c.bg, color: c.fg,
    }}>
      {label}
    </span>
  )
}

function ActionLink({ onClick, disabled, color, children }: {
  onClick: () => void; disabled?: boolean; color: string; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: 'none', border: 'none', color, cursor: disabled ? 'default' : 'pointer',
      fontSize: 12, fontWeight: 600, padding: '2px 6px', opacity: disabled ? 0.5 : 1,
    }}>
      {children}
    </button>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9CA3AF',
  textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 12px',
  borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { fontSize: 13, color: '#1F2937', padding: '9px 12px', borderBottom: '1px solid #F3F4F6' }
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const inp: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937', width: '100%', background: '#fff' }
const area: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937', resize: 'vertical', fontFamily: 'inherit', width: '100%' }

function btn(bg: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '7px 16px', border: 'none', borderRadius: 8, background: bg, color: '#fff', cursor: 'pointer' }
}
function outlineBtn(color: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '6px 14px', borderRadius: 8, border: `1px solid ${color}`, background: 'transparent', color, cursor: 'pointer' }
}
const btnGhost: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, padding: '7px 16px', border: '1px solid #D1D5DB',
  borderRadius: 8, background: '#fff', color: '#374151', cursor: 'pointer',
}
