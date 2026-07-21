'use client'

import { useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { CountrySelect } from '@/components/ui/country-select'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface CityRow { id: string; country: string; city: string }

const accent = getModuleColor('settings')
const accentLight = getModuleColor('settings', 'light')

export default function ReferenceCitiesPage() {
  const t = useTranslations('settings.reference_cities')
  const tNav = useTranslations('navigation')
  const [country, setCountry] = useState('Израиль')
  const [cities, setCities] = useState<CityRow[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newCity, setNewCity] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [errMsg, setErrMsg] = useState('')

  async function load() {
    if (!country) { setCities([]); return }
    setLoading(true)
    setErrMsg('')
    try {
      const res = await fetch(`/api/settings/reference-cities?country=${encodeURIComponent(country)}`)
      if (res.ok) {
        const data = await res.json()
        setCities(data.cities ?? [])
      } else {
        const e = await res.json()
        setErrMsg(e.error ?? t('error_load'))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [country])

  async function addCity() {
    const trimmed = newCity.trim()
    if (!trimmed) return
    setBusy(true)
    setErrMsg('')
    try {
      const res = await fetch('/api/settings/reference-cities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country, city: trimmed }),
      })
      if (res.ok) {
        setNewCity('')
        setShowAdd(false)
        await load()
      } else {
        const e = await res.json()
        setErrMsg(e.error ?? t('error_add'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(id: string) {
    const trimmed = editValue.trim()
    if (!trimmed) { setEditingId(null); return }
    setBusy(true)
    setErrMsg('')
    try {
      const res = await fetch(`/api/settings/reference-cities/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: trimmed }),
      })
      if (res.ok) {
        setEditingId(null)
        await load()
      } else {
        const e = await res.json()
        setErrMsg(e.error ?? t('error_save'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function deleteCity(id: string, cityName: string) {
    if (!confirm(t('confirm_delete').replace('{name}', cityName))) return
    setBusy(true)
    setErrMsg('')
    try {
      const res = await fetch(`/api/settings/reference-cities/${id}`, { method: 'DELETE' })
      if (res.ok) await load()
      else {
        const e = await res.json()
        setErrMsg(e.error ?? t('error_delete'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('settings'), href: '/dashboard/settings' },
        { label: t('title') },
      ]} />

      <div
        className="flex items-center rounded-xl overflow-hidden"
        style={{
          background: getModuleHeaderGradient('settings'),
          padding: '16px 24px',
          boxShadow: '0 2px 8px rgba(30,64,175,0.2)',
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>
          {t('title')}
        </h1>
      </div>

      <div style={{ maxWidth: 420 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
          {t('country_label')}
        </label>
        <CountrySelect
          value={country}
          onChange={setCountry}
          style={{
            width: '100%', padding: '8px 10px', fontSize: 13,
            border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none',
            backgroundColor: 'var(--surface)',
          }}
        />
      </div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            {t('cities_title')} ({cities.length})
          </h2>
          {!showAdd && (
            <button
              onClick={() => setShowAdd(true)}
              style={{
                padding: '7px 14px', background: accent, color: '#fff',
                border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t('add_city_button')}
            </button>
          )}
        </div>

        {errMsg && (
          <div style={{
            padding: '8px 12px', marginBottom: 12, background: '#FEF2F2',
            border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: 6, fontSize: 12,
          }}>{errMsg}</div>
        )}

        {showAdd && (
          <div style={{
            background: accentLight, border: `1px solid ${accent}33`,
            borderRadius: 8, padding: 14, marginBottom: 16,
          }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              {t('city_name_in_country_label').replace('{country}', country)}
            </label>
            <input
              autoFocus
              value={newCity}
              onChange={e => setNewCity(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addCity()
                if (e.key === 'Escape') { setShowAdd(false); setNewCity('') }
              }}
              placeholder={t('city_name_placeholder')}
              style={{
                width: '100%', padding: '8px 10px', fontSize: 13,
                border: '1px solid var(--border-strong)', borderRadius: 6, outline: 'none',
                marginBottom: 10, boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={addCity}
                disabled={!newCity.trim() || busy}
                style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 600,
                  background: newCity.trim() && !busy ? accent : 'var(--border)',
                  color: newCity.trim() && !busy ? 'var(--surface)' : 'var(--text-faint)',
                  border: 'none', borderRadius: 6,
                  cursor: newCity.trim() && !busy ? 'pointer' : 'not-allowed',
                }}
              >
                {busy ? t('saving') : t('save_button')}
              </button>
              <button
                onClick={() => { setShowAdd(false); setNewCity(''); setErrMsg('') }}
                style={{
                  padding: '7px 14px', fontSize: 12, color: 'var(--text-muted)',
                  background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
                }}
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
            {t('loading')}
          </div>
        ) : cities.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
            {t('empty_none')}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {cities.map(c => (
              <div
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', background: 'var(--surface-2)',
                  border: '1px solid var(--surface-2)', borderRadius: 6,
                }}
              >
                {editingId === c.id ? (
                  <>
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEdit(c.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      style={{
                        flex: 1, padding: '6px 8px', fontSize: 13,
                        border: `1px solid ${accent}`, borderRadius: 4, outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => saveEdit(c.id)}
                      disabled={busy}
                      style={{
                        padding: '5px 10px', fontSize: 12, fontWeight: 600,
                        background: accent, color: '#fff', border: 'none',
                        borderRadius: 4, cursor: busy ? 'not-allowed' : 'pointer',
                      }}
                    >{t('edit_save_button')}</button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{
                        padding: '5px 10px', fontSize: 12, color: 'var(--text-muted)',
                        background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 4, cursor: 'pointer',
                      }}
                    >{t('cancel')}</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{c.city}</span>
                    <button
                      onClick={() => { setEditingId(c.id); setEditValue(c.city) }}
                      style={{
                        padding: '5px 10px', fontSize: 12, color: accent,
                        background: 'var(--surface)', border: `1px solid ${accent}66`, borderRadius: 4, cursor: 'pointer',
                      }}
                    >{t('edit_button')}</button>
                    <button
                      onClick={() => deleteCity(c.id, c.city)}
                      style={{
                        padding: '5px 10px', fontSize: 12, color: '#DC2626',
                        background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 4, cursor: 'pointer',
                      }}
                    >{t('delete_button')}</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
