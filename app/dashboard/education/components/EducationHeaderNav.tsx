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
    { href: '/dashboard/education/units', label: t('units.title') },
    { href: '/dashboard/education/structure', label: t('structure.title') },
    { href: '/dashboard/education/track-assignment', label: t('track_assign.title') },
    { href: '/dashboard/education/kodesh', label: t('kodesh.nav') },
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
          <span>⚙</span>
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
