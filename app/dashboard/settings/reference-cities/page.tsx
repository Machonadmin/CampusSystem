'use client'

import { useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { CountrySelect } from '@/components/ui/country-select'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'

interface CityRow { id: string; country: string; city: string }

const accent = getModuleColor('settings')
const accentLight = getModuleColor('settings', 'light')

export default function ReferenceCitiesPage() {
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
        setErrMsg(e.error ?? 'Ошибка загрузки')
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
        setErrMsg(e.error ?? 'Ошибка добавления')
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
        setErrMsg(e.error ?? 'Ошибка сохранения')
      }
    } finally {
      setBusy(false)
    }
  }

  async function deleteCity(id: string, cityName: string) {
    if (!confirm(`Удалить город «${cityName}»?`)) return
    setBusy(true)
    setErrMsg('')
    try {
      const res = await fetch(`/api/settings/reference-cities/${id}`, { method: 'DELETE' })
      if (res.ok) await load()
      else {
        const e = await res.json()
        setErrMsg(e.error ?? 'Ошибка удаления')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <Breadcrumb items={[
        { label: 'Главная', href: '/dashboard' },
        { label: 'Настройки', href: '/dashboard/settings' },
        { label: 'Справочник городов' },
      ]} />

      <div
        className="flex items-center rounded-xl overflow-hidden"
        style={{
          background: getModuleHeaderGradient('settings'),
          padding: '12px 24px',
          boxShadow: '0 2px 8px rgba(30,64,175,0.2)',
        }}
      >
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF' }}>
          Справочник городов
        </h1>
      </div>

      <div style={{ maxWidth: 420 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
          Страна
        </label>
        <CountrySelect
          value={country}
          onChange={setCountry}
          style={{
            width: '100%', padding: '8px 10px', fontSize: 13,
            border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none',
            backgroundColor: '#fff',
          }}
        />
      </div>

      <div style={{
        background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#111827', margin: 0 }}>
            Города ({cities.length})
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
              + Добавить город
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
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Название города в стране «{country}»
            </label>
            <input
              autoFocus
              value={newCity}
              onChange={e => setNewCity(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addCity()
                if (e.key === 'Escape') { setShowAdd(false); setNewCity('') }
              }}
              placeholder="Например: Петах-Тиква"
              style={{
                width: '100%', padding: '8px 10px', fontSize: 13,
                border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none',
                marginBottom: 10, boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={addCity}
                disabled={!newCity.trim() || busy}
                style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 600,
                  background: newCity.trim() && !busy ? accent : '#E5E7EB',
                  color: newCity.trim() && !busy ? '#fff' : '#9CA3AF',
                  border: 'none', borderRadius: 6,
                  cursor: newCity.trim() && !busy ? 'pointer' : 'not-allowed',
                }}
              >
                {busy ? 'Сохранение...' : 'Добавить'}
              </button>
              <button
                onClick={() => { setShowAdd(false); setNewCity(''); setErrMsg('') }}
                style={{
                  padding: '7px 14px', fontSize: 12, color: '#6B7280',
                  background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer',
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
            Загрузка...
          </div>
        ) : cities.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
            Для этой страны пока нет городов
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {cities.map(c => (
              <div
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', background: '#F9FAFB',
                  border: '1px solid #F3F4F6', borderRadius: 6,
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
                    >Сохранить</button>
                    <button
                      onClick={() => setEditingId(null)}
                      style={{
                        padding: '5px 10px', fontSize: 12, color: '#6B7280',
                        background: '#fff', border: '1px solid #D1D5DB', borderRadius: 4, cursor: 'pointer',
                      }}
                    >Отмена</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 13, color: '#1F2937' }}>{c.city}</span>
                    <button
                      onClick={() => { setEditingId(c.id); setEditValue(c.city) }}
                      style={{
                        padding: '5px 10px', fontSize: 12, color: accent,
                        background: '#fff', border: `1px solid ${accent}66`, borderRadius: 4, cursor: 'pointer',
                      }}
                    >Изменить</button>
                    <button
                      onClick={() => deleteCity(c.id, c.city)}
                      style={{
                        padding: '5px 10px', fontSize: 12, color: '#DC2626',
                        background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 4, cursor: 'pointer',
                      }}
                    >Удалить</button>
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
