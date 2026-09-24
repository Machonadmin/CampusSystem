'use client'

import { useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Выбор должности представителя общины (תפקיד נציג הקהילה) из фиксированного
 * списка, утверждённого владельцем. В БД (contact_role / default_contact_role)
 * хранится КАНОНИЧЕСКАЯ ивритская подпись (титулы религиозные, владелец задал
 * их на иврите) — поэтому существующий фритекст и все места показа не трогаем.
 * Подписи опций локализуются через i18n; «Другое» открывает свободный ввод,
 * так что старые нестандартные значения не теряются при редактировании.
 */

const COMMUNITY_ROLES: { code: string; canonical: string }[] = [
  { code: 'rav', canonical: 'רב' },
  { code: 'shaliach', canonical: 'שליח' },
  { code: 'rav_ir', canonical: 'רב עיר' },
  { code: 'rav_machoz', canonical: 'רב מחוז' },
  { code: 'rav_medina', canonical: 'רב מדינה' },
  { code: 'rav_kehila', canonical: 'רב קהילה' },
  { code: 'rosh_kehila', canonical: 'ראש קהילה' },
  { code: 'mazkir', canonical: 'מזכיר' },
  { code: 'ozer_harav', canonical: 'עוזר הרב' },
]

const OTHER = '__other__'

export function CommunityRoleSelect({
  value,
  onChange,
  style,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  style?: React.CSSProperties
  ariaLabel?: string
}) {
  const t = useTranslations('education.community_roles')
  // «Другое» выбрано явно, но текст ещё пуст — без этого флага select тут же
  // прыгал бы обратно на «—» (пустое значение неотличимо от «ничего»).
  const [forcedOther, setForcedOther] = useState(false)

  const trimmed = value.trim()
  const known = COMMUNITY_ROLES.find(r => r.canonical === trimmed)
  // Непустое значение вне списка (легаси-фритекст) → режим «Другое» с текстом.
  const selectValue = forcedOther ? OTHER : (known ? known.code : (trimmed ? OTHER : ''))
  const showFree = selectValue === OTHER

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <select
        value={selectValue}
        aria-label={ariaLabel}
        onChange={e => {
          const v = e.target.value
          if (v === '') { setForcedOther(false); onChange('') }
          else if (v === OTHER) { setForcedOther(true); if (known) onChange('') }
          else { setForcedOther(false); onChange(COMMUNITY_ROLES.find(r => r.code === v)!.canonical) }
        }}
        style={style}
      >
        <option value="">—</option>
        {COMMUNITY_ROLES.map(r => (
          <option key={r.code} value={r.code}>{t(r.code)}</option>
        ))}
        <option value={OTHER}>{t('other')}</option>
      </select>
      {showFree && (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={t('other_ph')}
          aria-label={t('other')}
          style={style}
        />
      )}
    </div>
  )
}
