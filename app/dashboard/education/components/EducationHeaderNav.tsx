'use client'

import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Навигация в шапке модуля «Учёба». После наведения порядка (запрос владельца,
 * п. ט): дубли «דוחות / מבנה / יחידות» убраны отсюда — они в один клик в дашборде
 * לимудим (StudiesDashboard). Инструменты набора («דוחות-וגיוס», «הגדרות דף
 * הרשמה») переехали в саму вкладку גיוс (RecruitmentTab). Меню «⚙ ניהול» больше
 * не нужно — в шапке осталась только ежедневная ссылка «מערכת שעות».
 */

const linkChip: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.15)',
  padding: '6px 12px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap',
  display: 'inline-block', border: '1px solid rgba(255,255,255,0.28)',
  transition: 'background 0.12s',
}

export default function EducationHeaderNav() {
  const t = useTranslations('education')

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <a
        href="/dashboard/education/timetable"
        style={linkChip}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.26)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.15)' }}
      >
        {t('timetable.title')}
      </a>
    </div>
  )
}
