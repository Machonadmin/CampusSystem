'use client'

import { useEffect, useState } from 'react'

/**
 * Виджет «Ожидают моей подписи» на дашборде «Учёбы». По запросу владельца:
 * если ждёт 1 — показываем её; если несколько — показываем ПЕРВУЮ и стрелку
 * «ещё N», раскрывающую остальные. Данные — /api/workflow/my-pending-stages
 * (активные ролевые этапы приёма, чью роль несёт пользователь; superadmin —
 * все). Пусто/ошибка → виджет скрыт. Клик по строке ведёт на карточку, где
 * подписывают.
 */

interface PendingStage {
  stage_instance_id: string
  journey_id: string | null
  stage_code: string
  applicant: { full_name: string; hebrew_name: string | null }
}

// Названия этапов на иврите (основной язык учреждения).
const STAGE_HE: Record<string, string> = {
  academic: 'בדיקה לימודית',
  dormitory: 'פנימייה',
  jewishness: 'בירור יהדות',
  medical: 'חוות דעת רופא',
  medical_psych: 'חוות דעת פסיכולוג',
  final_approval: 'אישור סופי',
}

function initials(name: string): string {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('') || '?'
}

export default function PendingSignatures() {
  const [stages, setStages] = useState<PendingStage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/workflow/my-pending-stages')
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (alive) setStages(Array.isArray(b?.stages) ? b.stages : []) })
      .catch(() => { /* тихо */ })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])

  if (!loaded || stages.length === 0) return null

  const shown = expanded ? stages : stages.slice(0, 1)
  const moreCount = stages.length - 1

  const row = (s: PendingStage) => {
    const name = s.applicant?.hebrew_name || s.applicant?.full_name || '—'
    const stageName = STAGE_HE[s.stage_code] ?? s.stage_code
    const href = s.journey_id ? `/dashboard/education/leads/${s.journey_id}` : undefined
    return (
      <a key={s.stage_instance_id} href={href}
        style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 14px', textDecoration: 'none',
          borderTop: '1px solid var(--border)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'var(--surface-2)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'transparent' }}>
        <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--warn-tint)', color: 'var(--warn)',
          display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials(name)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>{stageName}</div>
        </div>
        <svg style={{ width: 15, height: 15, color: 'var(--text-faint)', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19.5L7.5 12l7.5-7.5" />
        </svg>
      </a>
    )
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px' }}>
        <svg style={{ width: 17, height: 17, color: 'var(--warn)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>ממתין לחתימתך</span>
        <span style={{ marginInlineStart: 'auto', fontSize: 11.5, fontWeight: 700, color: 'var(--warn)',
          background: 'var(--warn-tint)', padding: '2px 9px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>{stages.length}</span>
      </div>

      {shown.map(row)}

      {moreCount > 0 && (
        <button type="button" onClick={() => setExpanded(v => !v)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
            padding: '9px 14px', background: 'var(--surface-2)', border: 'none', borderTop: '1px solid var(--border)',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-strong)' }}>
          {expanded ? 'הסתר' : `עוד ${moreCount}`}
          <svg style={{ width: 14, height: 14, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      )}
    </div>
  )
}
