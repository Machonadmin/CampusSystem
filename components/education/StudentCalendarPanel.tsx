'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { monthGrid, toISODate } from '@/lib/calendar/calendar'

interface Lesson {
  id: string; date: string; time: string | null; end_time: string | null
  topic: string | null; group_name: string; subject: string | null
  teacher: string | null; status: 'present' | 'late' | 'absent' | null; is_cancelled: boolean
}

// Приоритет цвета дня: пропуск > опоздание > присутствие; иначе — нейтрально.
function dayColor(statuses: Array<string | null>): 'absent' | 'late' | 'present' | null {
  if (statuses.some(s => s === 'absent')) return 'absent'
  if (statuses.some(s => s === 'late')) return 'late'
  if (statuses.some(s => s === 'present')) return 'present'
  return null
}
const TINT: Record<'absent' | 'late' | 'present', { bg: string; fg: string }> = {
  present: { bg: 'var(--success-tint)', fg: 'var(--success)' },
  late: { bg: 'var(--warn-tint)', fg: 'var(--warn)' },
  absent: { bg: 'var(--danger-tint)', fg: 'var(--danger)' },
}

export default function StudentCalendarPanel({ journeyId }: { journeyId: string; canEdit?: boolean }) {
  const t = useTranslations('education.student_calendar')
  const { lang } = useLang()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-12
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const weeks = useMemo(() => monthGrid(year, month, 0), [year, month])
  const from = weeks[0][0].dateISO
  const to = weeks[weeks.length - 1][6].dateISO

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/calendar?from=${from}&to=${to}`)
      if (res.ok) { const b = await res.json(); setLessons(b.lessons ?? []) }
      else setLessons([])
    } finally { setLoading(false) }
  }, [journeyId, from, to])
  useEffect(() => { load() }, [load])

  const byDay = useMemo(() => {
    const m = new Map<string, Lesson[]>()
    for (const l of lessons) { const a = m.get(l.date) ?? []; a.push(l); m.set(l.date, a) }
    return m
  }, [lessons])

  function shiftMonth(delta: number) {
    setSelected(null)
    let mo = month + delta, yr = year
    if (mo < 1) { mo = 12; yr-- } else if (mo > 12) { mo = 1; yr++ }
    setMonth(mo); setYear(yr)
  }

  const monthLabel = (() => {
    try {
      const loc = lang === 'ru' ? 'ru-RU' : lang === 'he' ? 'he-IL' : 'en-US'
      return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    } catch { return `${month}/${year}` }
  })()
  const todayISO = toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate())

  const selectedLessons = selected ? (byDay.get(selected) ?? []) : []

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('title')}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => shiftMonth(-1)} style={navBtn}>‹</button>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', minWidth: 110, textAlign: 'center' }}>{monthLabel}</span>
          <button onClick={() => shiftMonth(1)} style={navBtn}>›</button>
        </div>
      </div>

      {/* Легенда */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        <Legend c="var(--success)" label={t('present')} />
        <Legend c="var(--warn)" label={t('late')} />
        <Legend c="var(--danger)" label={t('absent')} />
      </div>

      {/* Заголовки дней недели (Вс..Сб) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
        {[0, 1, 2, 3, 4, 5, 6].map(d => (
          <div key={d} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textAlign: 'center' }}>{t(`dow_${d}`)}</div>
        ))}
      </div>

      {/* Сетка месяца */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, opacity: loading ? 0.5 : 1 }}>
        {weeks.flat().map(cell => {
          const dl = byDay.get(cell.dateISO) ?? []
          const col = dayColor(dl.map(l => l.status))
          const tint = col ? TINT[col] : null
          const isToday = cell.dateISO === todayISO
          const isSel = cell.dateISO === selected
          const dayNum = Number(cell.dateISO.slice(8, 10))
          return (
            <button key={cell.dateISO} onClick={() => setSelected(isSel ? null : cell.dateISO)}
              style={{
                aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, borderRadius: 7, cursor: 'pointer', position: 'relative',
                border: `1px solid ${isSel ? 'var(--accent)' : isToday ? 'var(--border-strong)' : 'transparent'}`,
                background: tint ? tint.bg : 'var(--surface-2)',
                color: cell.inMonth ? (tint ? tint.fg : 'var(--text)') : 'var(--text-faint)',
                opacity: cell.inMonth ? 1 : 0.4, fontWeight: isToday ? 800 : 500,
              }}>
              {dayNum}
              {dl.length > 0 && <span style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: '50%', background: tint ? tint.fg : 'var(--text-faint)' }} />}
            </button>
          )
        })}
      </div>

      {/* Детализация дня */}
      {selected && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{selected}</div>
          {selectedLessons.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('no_lessons')}</div>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {selectedLessons.map(l => {
                const st = l.status ? TINT[l.status] : null
                return (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 9px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', opacity: l.is_cancelled ? 0.55 : 1 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--accent-strong)', minWidth: 42 }}>{l.time ?? '—'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{l.subject || l.group_name}{l.is_cancelled ? ` · ${t('cancelled')}` : ''}</div>
                      {l.topic && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{l.topic}</div>}
                      {l.teacher && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{l.teacher}</div>}
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', background: st ? st.bg : 'var(--surface)', color: st ? st.fg : 'var(--text-faint)', border: `1px solid ${st ? st.fg : 'var(--border-strong)'}` }}>
                      {l.status ? t(l.status) : t('not_marked')}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = { width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }

function Legend({ c, label }: { c: string; label: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{label}</span>
}
