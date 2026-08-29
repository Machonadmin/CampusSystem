'use client'

import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Кликабельный телефон: сам номер — ссылка tel: (звонок в одно касание),
 * рядом — иконка WhatsApp (wa.me). Раньше НИ ОДИН номер в системе не был
 * кликабельным: с телефона приходилось копировать вручную в звонилку.
 *
 * Нормализация для wa.me/tel: только цифры; ведущий 0 считаем израильским
 * номером и меняем на 972 (международный формат обязателен для wa.me).
 * stopPropagation — номера часто лежат в кликабельных строках таблиц.
 */

function intlDigits(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  if (phone.trim().startsWith('+')) return digits
  if (digits.startsWith('0')) return '972' + digits.slice(1)
  return digits
}

export function PhoneLink({ phone, style }: { phone: string; style?: React.CSSProperties }) {
  const tCommon = useTranslations('common')
  const intl = intlDigits(phone)
  if (!intl) return <span style={style}>{phone}</span>

  return (
    <span
      onClick={e => e.stopPropagation()}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, direction: 'ltr', ...style }}
    >
      <a
        href={`tel:+${intl}`}
        aria-label={tCommon('call')}
        style={{ color: 'inherit', textDecoration: 'none', whiteSpace: 'nowrap' }}
      >
        {phone}
      </a>
      <a
        href={`https://wa.me/${intl}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={tCommon('whatsapp')}
        title={tCommon('whatsapp')}
        style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="#25D366" aria-hidden>
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.13-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.24-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.73-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.13.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29Z" />
        </svg>
      </a>
    </span>
  )
}
