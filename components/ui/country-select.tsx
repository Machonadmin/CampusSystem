'use client'

import { POPULAR_COUNTRIES, ALL_COUNTRIES } from '@/lib/geo'

const OTHER_COUNTRIES = ALL_COUNTRIES.filter(c => !POPULAR_COUNTRIES.includes(c))

interface CountrySelectProps {
  value: string
  onChange: (country: string) => void
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
  placeholder?: string
}

export function CountrySelect({
  value, onChange, className, style, disabled, placeholder = '— Выберите страну —',
}: CountrySelectProps) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={className}
      style={style}
      disabled={disabled}
    >
      <option value="">{placeholder}</option>
      <optgroup label="Популярные страны">
        {POPULAR_COUNTRIES.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </optgroup>
      <optgroup label="Все страны">
        {OTHER_COUNTRIES.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </optgroup>
    </select>
  )
}
