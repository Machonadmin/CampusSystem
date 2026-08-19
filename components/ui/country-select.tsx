'use client'

import { POPULAR_COUNTRIES, ALL_COUNTRIES } from '@/lib/geo'
import { useTranslations } from '@/lib/i18n/LanguageContext'

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
  value, onChange, className, style, disabled, placeholder,
}: CountrySelectProps) {
  const t = useTranslations('common')
  const effectivePlaceholder = placeholder ?? `— ${t('select_country')} —`
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={className}
      style={style}
      disabled={disabled}
    >
      <option value="">{effectivePlaceholder}</option>
      <optgroup label={t('popular_countries')}>
        {POPULAR_COUNTRIES.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </optgroup>
      <optgroup label={t('all_countries')}>
        {OTHER_COUNTRIES.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </optgroup>
    </select>
  )
}
