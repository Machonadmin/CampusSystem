'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Навигация в шапке модуля «Учёба». После наведения порядка (запрос владельца,
 * п. ט): дубли «דוחות / מבנה / יחידות» убраны отсюда — они в один клик в дашборде
 * לимудим (StudiesDashboard). Инструменты набора («דוחות-וגיוס», «הגדרות דף
 * הרשמה») переехали в саму вкладку גיוс (RecruitmentTab). Меню «⚙ ניהול» больше
 * не нужно — в шапке осталась только ежедневная ссылка «מערכת שעות».
 */

// Ссылки лежат в слоте `actions` у <ModuleHeader/>. Шапка перестала быть цветным
// баннером с белым текстом, поэтому «осветление белым» здесь заменено токенами.
const CHIP_BG = 'var(--surface-2)'
const CHIP_BG_HOVER = 'var(--accent-tint)'

const linkChip: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: 'var(--text)', background: CHIP_BG,
  padding: '6px 12px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap',
  display: 'inline-block', border: '1px solid var(--border-strong)',
  transition: 'background 0.12s',
}

export default function EducationHeaderNav() {
  const t = useTranslations('education')

  // Ссылка «אישורי שיבוץ» видна ТОЛЬКО מנהל כללי: запрос к /approvals вернёт 403
  // остальным (тогда pending===null и ссылку не рисуем). Заодно показываем
  // счётчик ожидающих запросов. Деплой-безопасно: до миграции список пуст.
  const [pending, setPending] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    fetch('/api/education/schedule/approvals')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d) setPending((d.requests ?? []).length) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <a
        href="/dashboard/education/timetable"
        style={linkChip}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = CHIP_BG_HOVER }}
        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = CHIP_BG }}
      >
        {t('timetable.title')}
      </a>
      {pending !== null && (
        <a
          href="/dashboard/education/schedule-approvals"
          style={linkChip}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = CHIP_BG_HOVER }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = CHIP_BG }}
        >
          {t('schedule.approvals_link')}
          {pending > 0 && (
            <span style={{ marginInlineStart: 6, fontSize: 11, fontWeight: 700, background: 'var(--accent)', color: 'var(--accent-contrast)', borderRadius: 999, padding: '1px 7px' }}>{pending}</span>
          )}
        </a>
      )}
    </div>
  )
}
