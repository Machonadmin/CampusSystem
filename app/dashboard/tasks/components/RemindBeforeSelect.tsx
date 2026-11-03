'use client'

import { useTranslations } from '@/lib/i18n/LanguageContext'
import { REMIND_DAYS_BEFORE_OPTIONS } from '@/lib/tasks/reminders'

/**
 * Выбор раннего напоминания о задаче: «ללא» или за N дней до срока.
 * Напоминания «למחר» / «להיום» и после просрочки приходят всегда и здесь не
 * настраиваются.
 */
export default function RemindBeforeSelect({
  value, onChange, disabled, style,
}: {
  value: number | null
  onChange: (v: number | null) => void
  disabled?: boolean
  style?: React.CSSProperties
}) {
  const t = useTranslations('tasks')
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      style={style}
    >
      <option value="">{t('remind.none')}</option>
      {REMIND_DAYS_BEFORE_OPTIONS.map(n => (
        <option key={n} value={n}>{t('remind.days_before').replace('{n}', String(n))}</option>
      ))}
    </select>
  )
}
