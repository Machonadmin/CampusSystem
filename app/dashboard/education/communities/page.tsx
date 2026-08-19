'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'

/**
 * Управление общинами (קהילות): справочник, откуда приходят абитуриентки.
 * Раньше общины редактировались только через SQL/сид — теперь есть экран
 * CRUD над /api/education/communities (+ [id]). Правка доступна лишь тем, у
 * кого есть education.manage_communities (can_manage из GET); остальные видят
 * список только для чтения.
 */

interface Community {
  id: string
  name: string
  name_he: string | null
  country: string
  city: string
  default_contact_name: string | null
  default_contact_role: string | null
  default_contact_phone: string | null
  default_contact_email: string | null
  notes: string | null
  is_active: boolean
}

interface FormState {
  name: string
  name_he: string
  country: string
  city: string
  default_contact_name: string
  default_contact_role: string
  default_contact_phone: string
  default_contact_email: string
  notes: string
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  name: '', name_he: '', country: '', city: '',
  default_contact_name: '', default_contact_role: '',
  default_contact_phone: '', default_contact_email: '',
  notes: '', is_active: true,
}

function toForm(c: Community): FormState {
  return {
    name: c.name,
    name_he: c.name_he ?? '',
    country: c.country,
    city: c.city,
    default_contact_name: c.default_contact_name ?? '',
    default_contact_role: c.default_contact_role ?? '',
    default_contact_phone: c.default_contact_phone ?? '',
    default_contact_email: c.default_contact_email ?? '',
    notes: c.notes ?? '',
    is_active: c.is_active,
  }
}

export default function CommunitiesPage() {
  const t = useTranslations('education.communities')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const [communities, setCommunities] = useState<Community[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // Форма: null — закрыта; {id:null} — создание; {id} — правка.
  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const qs = new URLSearchParams()
      if (showInactive) qs.set('active_only', 'false')
      const res = await fetch(`/api/education/communities?${qs.toString()}`)
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setErr(b.error ?? t('load_failed')); return
      }
      const b = await res.json()
      setCommunities(b.communities ?? [])
      setCanManage(!!b.can_manage)
    } catch {
      setErr(t('load_failed'))
    } finally {
      setLoading(false)
    }
  }, [t, showInactive])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return communities
    return communities.filter(c =>
      c.name.toLowerCase().includes(q)
      || (c.name_he ?? '').toLowerCase().includes(q)
      || c.city.toLowerCase().includes(q)
      || c.country.toLowerCase().includes(q))
  }, [communities, search])

  function openNew() {
    setForm(EMPTY_FORM); setFormError(null); setEditing({ id: null })
  }
  function openEdit(c: Community) {
    setForm(toForm(c)); setFormError(null); setEditing({ id: c.id })
  }
  function closeForm() {
    setEditing(null); setFormError(null)
  }
  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function save() {
    if (!form.name.trim()) { setFormError(t('name_required')); return }
    if (!form.country.trim()) { setFormError(t('country_required')); return }
    if (!form.city.trim()) { setFormError(t('city_required')); return }
    setBusy(true); setFormError(null)
    try {
      const payload = {
        name: form.name.trim(),
        name_he: form.name_he.trim() || null,
        country: form.country.trim(),
        city: form.city.trim(),
        default_contact_name: form.default_contact_name.trim() || null,
        default_contact_role: form.default_contact_role.trim() || null,
        default_contact_phone: form.default_contact_phone.trim() || null,
        default_contact_email: form.default_contact_email.trim() || null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      }
      const isEdit = editing?.id != null
      const res = await fetch(
        isEdit ? `/api/education/communities/${editing!.id}` : '/api/education/communities',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setFormError(b.error ?? t('save_failed')); return
      }
      closeForm()
      await load()
    } catch {
      setFormError(t('save_failed'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(c: Community) {
    if (!window.confirm(t('delete_confirm').replace('{name}', c.name))) return
    setErr(null)
    try {
      const res = await fetch(`/api/education/communities/${c.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setErr(b.error ?? t('save_failed')); return
      }
      await load()
    } catch {
      setErr(t('save_failed'))
    }
  }

  const inputStyle: CSSProperties = {
    width: '100%', fontSize: 13, padding: '8px 10px',
    border: '1px solid var(--border-strong)', borderRadius: 8,
    color: 'var(--text)', background: 'var(--surface)',
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <div style={{
        background: getModuleHeaderGradient('education'), borderRadius: 12,
        padding: '16px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{t('title')}</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{t('subtitle')}</p>
        </div>
        {canManage && (
          <button onClick={openNew} style={{
            fontSize: 13, fontWeight: 600, padding: '8px 16px', border: 'none',
            borderRadius: 8, background: 'var(--surface)', color: 'var(--accent-strong)', cursor: 'pointer',
          }}>
            {t('new')}
          </button>
        )}
      </div>

      {err && <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('search_placeholder')}
          style={{ flex: '1 1 260px', maxWidth: 420, fontSize: 13, padding: '9px 12px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)' }}
        />
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          {t('show_inactive')}
        </label>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{tCommon('loading')}</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>
            <div style={{ flex: 1, minWidth: 160 }}>{t('col_name')}</div>
            <div style={{ flex: 1, minWidth: 140 }}>{t('col_location')}</div>
            <div style={{ flex: 1, minWidth: 160 }}>{t('col_contact')}</div>
            {canManage && <div style={{ width: 130, textAlign: 'end' }} />}
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('empty')}</div>
          ) : filtered.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '11px 14px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', opacity: c.is_active ? 1 : 0.55 }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
                  {c.name_he || c.name}
                  {!c.is_active && <span style={{ marginInlineStart: 8, fontSize: 11, color: 'var(--text-faint)' }}>({t('status_inactive')})</span>}
                </div>
                {c.name_he && c.name !== c.name_he && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{c.name}</div>}
              </div>
              <div style={{ flex: 1, minWidth: 140, fontSize: 12.5, color: 'var(--text-muted)' }}>
                {[c.city, c.country].filter(Boolean).join(', ')}
              </div>
              <div style={{ flex: 1, minWidth: 160, fontSize: 12.5, color: 'var(--text-muted)' }}>
                {c.default_contact_name ? (
                  <>
                    <div style={{ color: 'var(--text)' }}>{c.default_contact_name}{c.default_contact_role ? ` · ${c.default_contact_role}` : ''}</div>
                    {(c.default_contact_phone || c.default_contact_email) && (
                      <div style={{ marginTop: 1 }}>{[c.default_contact_phone, c.default_contact_email].filter(Boolean).join(' · ')}</div>
                    )}
                  </>
                ) : '—'}
              </div>
              {canManage && (
                <div style={{ width: 130, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => openEdit(c)} style={{ fontSize: 12.5, fontWeight: 600, padding: '5px 10px', border: '1px solid var(--border-strong)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>{tCommon('edit')}</button>
                  <button onClick={() => remove(c)} style={{ fontSize: 12.5, fontWeight: 600, padding: '5px 10px', border: '1px solid var(--danger)', borderRadius: 7, background: 'var(--surface)', color: 'var(--danger)', cursor: 'pointer' }}>{tCommon('delete')}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Форма создания/правки */}
      {editing && (
        <div
          onClick={closeForm}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 50 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 22, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>
              {editing.id ? t('edit_title') : t('new')}
            </h2>
            {formError && <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>{formError}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label={`${t('f_name')} *`}><input style={inputStyle} value={form.name} onChange={e => setField('name', e.target.value)} /></Field>
              <Field label={t('f_name_he')}><input style={inputStyle} value={form.name_he} onChange={e => setField('name_he', e.target.value)} dir="rtl" /></Field>
              <Field label={`${t('f_country')} *`}><input style={inputStyle} value={form.country} onChange={e => setField('country', e.target.value)} /></Field>
              <Field label={`${t('f_city')} *`}><input style={inputStyle} value={form.city} onChange={e => setField('city', e.target.value)} /></Field>
              <Field label={t('f_contact_name')}><input style={inputStyle} value={form.default_contact_name} onChange={e => setField('default_contact_name', e.target.value)} /></Field>
              <Field label={t('f_contact_role')}><input style={inputStyle} value={form.default_contact_role} onChange={e => setField('default_contact_role', e.target.value)} /></Field>
              <Field label={t('f_contact_phone')}><input style={inputStyle} value={form.default_contact_phone} onChange={e => setField('default_contact_phone', e.target.value)} /></Field>
              <Field label={t('f_contact_email')}><input style={inputStyle} value={form.default_contact_email} onChange={e => setField('default_contact_email', e.target.value)} /></Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label={t('f_notes')}><textarea style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} value={form.notes} onChange={e => setField('notes', e.target.value)} /></Field>
            </div>
            <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', marginTop: 12 }}>
              <input type="checkbox" checked={form.is_active} onChange={e => setField('is_active', e.target.checked)} />
              {t('f_active')}
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={closeForm} disabled={busy} style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>{tCommon('cancel')}</button>
              <button onClick={save} disabled={busy} style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', border: 'none', borderRadius: 8, background: 'var(--accent-strong)', color: '#fff', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>{tCommon('save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  )
}
