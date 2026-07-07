'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { matchesSearch, isValidEmail, type ContactStats } from '@/lib/contacts/directory'
import { CONTACT_TYPES, CONTACT_CATEGORIES } from '@/lib/contacts/validation'

interface Contact {
  id: string
  name: string
  contact_type: string
  category: string
  email: string | null
  phone: string | null
  address: string | null
  website: string | null
  contact_person: string | null
  notes: string | null
  is_active: boolean
}

interface FormState {
  name: string
  contact_type: string
  category: string
  email: string
  phone: string
  address: string
  website: string
  contact_person: string
  notes: string
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  name: '', contact_type: 'organization', category: 'other',
  email: '', phone: '', address: '', website: '',
  contact_person: '', notes: '', is_active: true,
}

export default function ContactsClient({ canManage }: { canManage: boolean }) {
  const t = useTranslations('contacts')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const primary = getModuleColor('contacts', 'primary')
  const light = getModuleColor('contacts', 'light')

  const [contacts, setContacts] = useState<Contact[]>([])
  const [stats, setStats] = useState<ContactStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  // inline editor: null — закрыт; '' — новый контакт; иначе id редактируемого
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/contacts')
      if (res.status === 403) { setError(t('list.forbidden')); setContacts([]); setStats(null); return }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setError(b.error ?? t('list.load_error')); setContacts([]); setStats(null); return
      }
      const b = await res.json()
      setContacts(b.contacts ?? [])
      setStats(b.stats ?? null)
    } catch {
      setError(t('list.load_error')); setContacts([]); setStats(null)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    let list = contacts
    if (categoryFilter) list = list.filter(c => c.category === categoryFilter)
    if (search.trim()) list = list.filter(c => matchesSearch(c, search))
    return list
  }, [contacts, search, categoryFilter])

  function openNew() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setEditingId('')
  }

  function openEdit(c: Contact) {
    if (!canManage) return
    setForm({
      name: c.name,
      contact_type: c.contact_type,
      category: c.category,
      email: c.email ?? '',
      phone: c.phone ?? '',
      address: c.address ?? '',
      website: c.website ?? '',
      contact_person: c.contact_person ?? '',
      notes: c.notes ?? '',
      is_active: c.is_active,
    })
    setFormError(null)
    setEditingId(c.id)
  }

  function closeForm() {
    setEditingId(null)
    setFormError(null)
  }

  async function save() {
    if (!form.name.trim()) { setFormError(t('form.name_required')); return }
    if (form.email.trim() && !isValidEmail(form.email.trim())) {
      setFormError(t('form.email_invalid')); return
    }
    setBusy(true); setFormError(null)
    try {
      const payload = {
        name: form.name.trim(),
        contact_type: form.contact_type,
        category: form.category,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        website: form.website.trim() || null,
        contact_person: form.contact_person.trim() || null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      }
      const res = editingId === ''
        ? await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/contacts/${editingId}`, {
            method: 'PATCH',
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

  async function remove() {
    if (!editingId) return
    if (!confirm(t('delete_confirm'))) return
    setBusy(true); setFormError(null)
    try {
      const res = await fetch(`/api/contacts/${editingId}`, { method: 'DELETE' })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setFormError(b.error ?? t('errors.action')); return
      }
      closeForm()
      await load()
    } catch {
      setFormError(t('errors.action'))
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
        background: getModuleHeaderGradient('contacts'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(219,39,119,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{t('list.subtitle')}</div>
        </div>
        {canManage && (
          <button onClick={openNew} style={{
            fontSize: 13, fontWeight: 600, padding: '8px 16px', border: 'none',
            borderRadius: 8, background: '#fff', color: primary, cursor: 'pointer',
          }}>
            {t('list.new_contact')}
          </button>
        )}
      </div>

      {/* Stats bar */}
      {stats && (
        <div style={{
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 16px',
          display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{ fontSize: 13, color: '#374151' }}>
            <b style={{ color: primary }}>{stats.total}</b> · {t('stats.total')}
          </span>
          <span style={{ fontSize: 13, color: '#374151' }}>
            <b style={{ color: primary }}>{stats.active}</b> · {t('stats.active')}
          </span>
          {CONTACT_CATEGORIES.filter(cat => (stats.by_category[cat] ?? 0) > 0).map(cat => (
            <span key={cat} style={{
              fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
              background: light, color: '#9D174D',
            }}>
              {t(`categories.${cat}`)} · {stats.by_category[cat]}
            </span>
          ))}
        </div>
      )}

      {/* Search + category filter */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('list.search_placeholder')}
          style={{ flex: '1 1 260px', maxWidth: 420, fontSize: 13, padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937' }}
        />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          style={{ fontSize: 13, padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937', background: '#fff' }}
        >
          <option value="">{t('list.all_categories')}</option>
          {CONTACT_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{t(`categories.${cat}`)}</option>
          ))}
        </select>
      </div>

      {/* Inline editor */}
      {canManage && editingId !== null && (
        <div style={{ background: '#fff', border: `1px solid ${primary}`, borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: '0 0 12px' }}>
            {editingId === '' ? t('form.new_title') : t('form.edit_title')}
          </h2>
          {formError && <div style={{ fontSize: 13, color: '#DC2626', marginBottom: 10 }}>{formError}</div>}
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <Field label={t('fields.name')}>
              <input value={form.name} onChange={e => setField('name', e.target.value)} style={inp} />
            </Field>
            <Field label={t('fields.contact_type')}>
              <select value={form.contact_type} onChange={e => setField('contact_type', e.target.value)} style={inp}>
                {CONTACT_TYPES.map(tp => (
                  <option key={tp} value={tp}>{t(`types.${tp}`)}</option>
                ))}
              </select>
            </Field>
            <Field label={t('fields.category')}>
              <select value={form.category} onChange={e => setField('category', e.target.value)} style={inp}>
                {CONTACT_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{t(`categories.${cat}`)}</option>
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
            <Field label={t('fields.website')} full>
              <input value={form.website} onChange={e => setField('website', e.target.value)} placeholder="https://" style={inp} />
            </Field>
            <Field label={t('fields.notes')} full>
              <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} style={area} />
            </Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
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
            {editingId !== '' && (
              <button onClick={remove} disabled={busy} style={{ ...btnGhost, color: '#DC2626', borderColor: '#FCA5A5', marginInlineStart: 'auto' }}>
                {tCommon('delete')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Directory list */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
        {error ? (
          <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
        ) : loading ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>{tCommon('loading')}</div>
        ) : filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>{t('list.empty')}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[t('list.name'), t('list.type'), t('list.category'), t('list.email'), t('list.phone'), t('list.status')].map((h, i) => (
                    <th key={i} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr
                    key={c.id}
                    onClick={() => openEdit(c)}
                    style={{ cursor: canManage ? 'pointer' : 'default' }}
                    onMouseEnter={e => { if (canManage) (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#fff' }}
                  >
                    <td style={td}>
                      <div style={{ fontWeight: 500, color: '#1F2937' }}>{c.name}</div>
                      {c.contact_person && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{c.contact_person}</div>}
                    </td>
                    <td style={td}>{t(`types.${c.contact_type}`)}</td>
                    <td style={td}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: light, color: '#9D174D' }}>
                        {t(`categories.${c.category}`)}
                      </span>
                    </td>
                    <td style={td}>{c.email || '—'}</td>
                    <td style={td}>{c.phone || '—'}</td>
                    <td style={td}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999,
                        background: c.is_active ? light : '#F3F4F6',
                        color: c.is_active ? '#9D174D' : '#9CA3AF',
                      }}>
                        {c.is_active ? t('status.active') : t('status.inactive')}
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

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'grid', gap: 4, gridColumn: full ? '1 / -1' : undefined }}>
      {label}
      {children}
    </label>
  )
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#9CA3AF',
  textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 12px',
  borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap',
}
const td: React.CSSProperties = { fontSize: 13, color: '#1F2937', padding: '9px 12px', borderBottom: '1px solid #F3F4F6' }
const inp: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937', width: '100%', background: '#fff' }
const area: React.CSSProperties = { fontSize: 13, padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937', resize: 'vertical', fontFamily: 'inherit', width: '100%' }

function btn(bg: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, padding: '7px 16px', border: 'none', borderRadius: 8, background: bg, color: '#fff', cursor: 'pointer' }
}
const btnGhost: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, padding: '7px 16px', border: '1px solid #D1D5DB',
  borderRadius: 8, background: '#fff', color: '#374151', cursor: 'pointer',
}
