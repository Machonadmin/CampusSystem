'use client'

import { useState, useEffect } from 'react'
import { CITIES_BY_COUNTRY } from '@/lib/geo'

interface CitySelectProps {
  country: string
  value: string
  onChange: (city: string) => void
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
}

export function CitySelect({ country, value, onChange, className, style, disabled }: CitySelectProps) {
  const cities = CITIES_BY_COUNTRY[country] ?? []
  const hasCities = cities.length > 0

  const [showCustomInput, setShowCustomInput] = useState(false)

  useEffect(() => {
    if (value && hasCities && !cities.includes(value)) {
      setShowCustomInput(true)
    } else if (!value) {
      setShowCustomInput(false)
    }
  }, [country]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!hasCities) {
    return (
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Введите название города"
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
          placeholder="Введите название города"
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
          ← Выбрать из списка
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
      disabled={disabled}
    >
      <option value="">— Выберите город —</option>
      {cities.map(city => (
        <option key={city} value={city}>{city}</option>
      ))}
      <option value="__other__">— Другой город —</option>
    </select>
  )
}
