'use client'

import { useLang } from '@/lib/i18n/LanguageContext'
import { yearLevelTitle } from '@/lib/education/year-level'

/** Число лет-ступеней по умолчанию, если у маршрута не задан years_count. */
const DEFAULT_YEARS = 4

interface Props {
  /** Текущее значение (строкой, как в state форм); '' — не выбрано. */
  value: string
  onChange: (value: string) => void
  /** years_count выбранного маршрута; null/undefined → 4. */
  yearsCount?: number | null
  /** Показать пустой вариант «—» (значение ''). */
  includeEmpty?: boolean
  disabled?: boolean
  ariaLabel?: string
  style?: React.CSSProperties
}

/**
 * Единый список «год-ступень» (year_level) для учёбы: варианты 1..years_count
 * маршрута (по умолчанию 4), подписи — yearLevelTitle («שנה א» / «Год 1»).
 * Если текущее значение вне диапазона маршрута (старые данные) — оно всё равно
 * показывается, чтобы не потерять его молча при редактировании.
 */
export default function YearLevelSelect({ value, onChange, yearsCount, includeEmpty, disabled, ariaLabel, style }: Props) {
  const { lang } = useLang()
  const max = Math.max(1, yearsCount ?? DEFAULT_YEARS)
  const years = Array.from({ length: max }, (_, i) => i + 1)
  const current = Number(value)
  if (value && Number.isInteger(current) && current > max) years.push(current)

  return (
    <select aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} style={style} disabled={disabled}>
      {includeEmpty && <option value="">—</option>}
      {years.map(y => <option key={y} value={y}>{yearLevelTitle(y, lang)}</option>)}
    </select>
  )
}
