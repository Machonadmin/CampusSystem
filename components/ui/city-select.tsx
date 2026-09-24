'use client'

import { useTranslations } from '@/lib/i18n/LanguageContext'

interface CitySelectProps {
  /** Не используется: справочника городов больше нет. Оставлен ради совместимости вызовов. */
  country?: string
  value: string
  onChange: (city: string) => void
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
}

/**
 * Поле «עיר». Раньше это был выпадающий список из справочника reference_cities
 * (экран «רשימת ערים» в настройках). По решению владельца (2026-09-24) справочник
 * убран: город — просто текст, который вводят руками.
 */
export function CitySelect({ value, onChange, className, style, disabled }: CitySelectProps) {
  const t = useTranslations('common')
  return (
    <input aria-label={t('city_input_placeholder')}
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
