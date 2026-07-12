'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface CitySelectProps {
  country: string
  value: string
  onChange: (city: string) => void
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
}

const cityCache = new Map<string, string[]>()

export function CitySelect({ country, value, onChange, className, style, disabled }: CitySelectProps) {
  const t = useTranslations('common')
  const [cities, setCities] = useState<string[]>(() => cityCache.get(country) ?? [])
  const [loading, setLoading] = useState(false)
  const [showCustomInput, setShowCustomInput] = useState(false)

  useEffect(() => {
    if (!country) { setCities([]); return }
    const cached = cityCache.get(country)
    if (cached) { setCities(cached); return }
    setLoading(true)
    fetch(`/api/references/cities?country=${encodeURIComponent(country)}`)
      .then(r => r.ok ? r.json() : { cities: [] })
      .then((data: { cities: string[] }) => {
        cityCache.set(country, data.cities ?? [])
        setCities(data.cities ?? [])
      })
      .finally(() => setLoading(false))
  }, [country])

  useEffect(() => {
    if (value && cities.length > 0 && !cities.includes(value)) {
      setShowCustomInput(true)
    } else if (!value) {
      setShowCustomInput(false)
    }
  }, [country, cities]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasCities = cities.length > 0

  if (!hasCities && !loading) {
    return (
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={t('city_input_placeholder')}
        className={className}
        style={style}
        disabled={disabled}
      />
    )
  }

  if (showCustomInput) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={t('city_input_placeholder')}
          autoFocus
          className={className}
          style={style}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => { setShowCustomInput(false); onChange('') }}
          style={{ alignSelf: 'flex-start', fontSize: 11, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
        >
          ← {t('city_choose_from_list')}
        </button>
      </div>
    )
  }

  return (
    <select
      value={value}
      onChange={e => {
        if (e.target.value === '__other__') {
          setShowCustomInput(true)
          onChange('')
        } else {
          onChange(e.target.value)
        }
      }}
      className={className}
      style={style}
      disabled={disabled || loading}
    >
      <option value="">{loading ? t('loading') : `— ${t('select_city')} —`}</option>
      {cities.map(city => (
        <option key={city} value={city}>{city}</option>
      ))}
      <option value="__other__">— {t('other_city')} —</option>
    </select>
  )
}
