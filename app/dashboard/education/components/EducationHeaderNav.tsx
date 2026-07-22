'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Навигация в шапке модуля «Учёба». Наводим порядок (запрос владельца
 * «יש יותר מידי אני רוצה לעשות סדר»): три ссылки, нужные каждый день, всегда на
 * виду, а инструменты настройки/структуры — под одним меню «⚙ Управление».
 * Ничего не убрано — всё доступно, но не мельтешит.
 */

interface NavLink { href: string; label: string }

// Ежедневные ссылки — белые «таблетки» с зелёным текстом: читаемо на зелёной шапке
// (было — белый текст на светло-зелёном фоне, почти нечитаемо).
const linkChip: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 700, color: '#047857', background: '#fff',
  padding: '6px 13px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap',
  display: 'inline-block', boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
}
// Кнопка меню «Управление» — прозрачная с контуром, визуально отделена от ссылок.
const menuChip: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 650, color: '#fff', background: 'rgba(255,255,255,0.16)',
  padding: '6px 12px', borderRadius: 8, whiteSpace: 'nowrap',
  border: '1px solid rgba(255,255,255,0.45)', cursor: 'pointer',
}

export default function EducationHeaderNav() {
  const t = useTranslations('education')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Ежедневные ссылки — всегда на виду.
  const daily: NavLink[] = [
    { href: '/dashboard/education/timetable', label: t('timetable.title') },
    { href: '/dashboard/education/my-day', label: t('my_day.title') },
    { href: '/dashboard/education/reports', label: t('reports.title') },
  ]

  // Инструменты управления/настройки — под меню.
  const management: NavLink[] = [
    { href: '/dashboard/education/recruitment-report', label: t('recruitment_report.title') },
    { href: '/dashboard/education/recruitment-form', label: t('recruitment_form.title') },
    { href: '/dashboard/education/units', label: t('units.title') },
    { href: '/dashboard/education/structure', label: t('structure.title') },
    // סמסטרים (ישן) ושיוך מסלול הוסרו מהתפריט — הוחלפו בזרימה המאוחדת «סמסטרים»
    // תחת מרחב הלימודים. הנתיבים עדיין נגישים ישירות אם צריך.
    { href: '/dashboard/education/kodesh', label: t('kodesh.nav') },
    { href: '/dashboard/education/communities', label: t('communities.nav') },
    { href: '/dashboard/education/students/import', label: t('import.title') },
  ]

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {daily.map(l => (
        <a key={l.href} href={l.href} style={linkChip}>{l.label}</a>
      ))}

      <div ref={wrapRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          style={{
            ...menuChip,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: open ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.16)',
          }}
          title={t('nav.management_hint')}
        >
          <svg style={{ width: 15, height: 15 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{t('nav.management')}</span>
          <span style={{ fontSize: 9, opacity: 0.85 }}>{open ? '▲' : '▼'}</span>
        </button>

        {open && (
          <div style={{
            position: 'absolute', insetInlineEnd: 0, top: 'calc(100% + 6px)', zIndex: 120,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.16)', minWidth: 200, overflow: 'hidden',
          }}>
            {management.map(l => (
              <a
                key={l.href}
                href={l.href}
                style={{
                  display: 'block', padding: '10px 14px', fontSize: 13, fontWeight: 500,
                  color: 'var(--text)', textDecoration: 'none', whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--surface-2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}
              >
                {l.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
