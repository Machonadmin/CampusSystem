'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'

interface Grade {
  assessment_id: string
  title: string
  subject: string | null
  group_name: string
  score: number | null
  max_score: number
  date: string | null
}

// Цвет балла по доле от максимума: как в дашборде (85 / 70 порогами).
function scoreColor(score: number | null, max: number): string {
  if (score === null || max <= 0) return 'var(--text-faint)'
  const p = (score / max) * 100
  if (p >= 85) return 'var(--success)'
  if (p >= 70) return 'var(--warn)'
  return 'var(--danger)'
}

/**
 * Оценки студентки (§5): список её выставленных оценок, сгруппированный по
 * предмету и отсортированный по дате (свежие сверху). Питается новым
 * эндпоинтом journeys/[id]/grades (только чтение). journeyId-driven, как
 * остальные Student*Panel.
 */
export default function StudentGradesPanel({ journeyId }: { journeyId: string; canEdit?: boolean }) {
  const t = useTranslations('education.grades_panel')
  const { lang } = useLang()
  const [grades, setGrades] = useState<Grade[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/education/journeys/${journeyId}/grades`)
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (alive) setGrades(b?.grades ?? []) })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [journeyId])

  // Группировка по предмету (порядок предметов — по первой встреченной оценке,
  // т.е. по самой свежей дате, т.к. endpoint отдаёт уже отсортированным).
  const groups = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, Grade[]>()
    for (const g of grades) {
      const key = g.subject || g.group_name || '—'
      if (!map.has(key)) { map.set(key, []); order.push(key) }
      map.get(key)!.push(g)
    }
    return order.map(key => ({ subject: key, items: map.get(key)! }))
  }, [grades])

  const fmtDate = (d: string | null): string => {
    if (!d) return ''
    try {
      const loc = lang === 'ru' ? 'ru-RU' : lang === 'he' ? 'he-IL' : 'en-US'
      const dt = new Date(`${d}T00:00:00Z`)
      if (isNaN(dt.getTime())) return d
      return dt.toLocaleDateString(loc, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    } catch { return d }
  }

  if (!loaded) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>{t('title')}</h3>

      {grades.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {groups.map(gr => (
            <div key={gr.subject}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>{gr.subject}</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {gr.items.map(g => (
                  <div key={g.assessment_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</div>
                      {g.date && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{fmtDate(g.date)}</div>}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', color: scoreColor(g.score, g.max_score) }}>
                      {g.score === null ? '—' : g.score}
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)' }}> / {g.max_score}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
