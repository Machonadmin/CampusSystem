'use client'

import React, { useEffect, useState } from 'react'
import DatePicker, { registerLocale } from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { ru, he, enUS } from 'date-fns/locale'
import './date-input.css'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'

registerLocale('ru', ru)
registerLocale('he', he)
registerLocale('en', enUS)

interface DateInputProps {
  value: Date | null
  onChange: (date: Date | null) => void
  placeholder?: string
  disabled?: boolean
  maxDate?: Date
  minDate?: Date
  locale?: 'ru' | 'he' | 'en'
  style?: React.CSSProperties
}

export function DateInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  maxDate,
  minDate,
  locale,
  style,
}: DateInputProps) {
  const t = useTranslations('common')
  const { lang } = useLang()
  // По умолчанию — язык интерфейса (раньше был жёстко 'ru' → календарь по-русски).
  const effLocale: 'ru' | 'he' | 'en' = locale ?? lang
  // На узком экране открываем календарь модалкой по центру (withPortal), иначе
  // всплывашка «убегала» за правый край внутри модала на телефоне.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return (
    <DatePicker
      selected={value}
      onChange={onChange}
      dateFormat="dd.MM.yyyy"
      locale={effLocale}
      withPortal={isMobile}
      showYearDropdown
      showMonthDropdown
      dropdownMode="select"
      placeholderText={placeholder ?? t('date_format_placeholder')}
      disabled={disabled}
      maxDate={maxDate}
      minDate={minDate}
      yearDropdownItemNumber={100}
      scrollableYearDropdown
      wrapperClassName="react-datepicker-wrapper"
      customInput={
        <input
          type="text"
          style={{
            width: '100%',
            padding: '7px 10px',
            fontSize: 13,
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            outline: 'none',
            boxSizing: 'border-box',
            ...style,
          }}
        />
      }
    />
  )
}
