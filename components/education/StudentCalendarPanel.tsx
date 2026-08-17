'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { monthGrid, toISODate } from '@/lib/calendar/calendar'

interface Lesson {
  id: string; date: string; time: string | null; end_time: string | null
  topic: string | null; group_name: string; subject: string | null
  teacher: string | null; status: 'present' | 'late' | 'absent' | null; is_cancelled: boolean
}
interface Meeting { id: string; date: string; time: string | null; title: string; status: string }
interface PersonalEvent { id: string; event_date: string; event_time: string | null; title: string; notes: string | null }

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

export default function StudentCalendarPanel({ journeyId, personal = false }: { journeyId: string; canEdit?: boolean; personal?: boolean }) {
  const t = useTranslations('education.student_calendar')
  const { lang } = useLang()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-12
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Форма добавления личного события (только в портале, personal=true).
  const [peTitle, setPeTitle] = useState('')
  const [peTime, setPeTime] = useState('')
  const [peSaving, setPeSaving] = useState(false)

  const weeks = useMemo(() => monthGrid(year, month, 0), [year, month])
  const from = weeks[0][0].dateISO
  const to = weeks[weeks.length - 1][6].dateISO

  // Личные события — ТОЛЬКО в портале (personal=true). В сотрудническом просмотре
  // этот запрос не делается вовсе (и вернул бы 403 — приватность на структуре).
  const loadPersonal = useCallback(async () => {
    if (!personal) return
    try {
      const res = await fetch(`/api/portal/personal-events?from=${from}&to=${to}`)
      if (res.ok) { const b = await res.json(); setPersonalEvents(b.events ?? []) }
      else setPersonalEvents([])
    } catch { setPersonalEvents([]) }
  }, [personal, from, to])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/calendar?from=${from}&to=${to}`)
      if (res.ok) { const b = await res.json(); setLessons(b.lessons ?? []); setMeetings(b.meetings ?? []) }
      else { setLessons([]); setMeetings([]) }
      await loadPersonal()
    } finally { setLoading(false) }
  }, [journeyId, from, to, loadPersonal])
  useEffect(() => { load() }, [load])

  async function addPersonal() {
    const title = peTitle.trim()
    if (!title || !selected || peSaving) return
    setPeSaving(true)
    try {
      const res = await fetch('/api/portal/personal-events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, event_date: selected, event_time: peTime || null }),
      })
      if (res.ok) { setPeTitle(''); setPeTime(''); await loadPersonal() }
    } finally { setPeSaving(false) }
  }

  async function deletePersonal(id: string) {
    const res = await fetch(`/api/portal/personal-events/${id}`, { method: 'DELETE' })
    if (res.ok) await loadPersonal()
  }

  const byDay = useMemo(() => {
    const m = new Map<string, Lesson[]>()
    for (const l of lessons) { const a = m.get(l.date) ?? []; a.push(l); m.set(l.date, a) }
    return m
  }, [lessons])
  const meetingsByDay = useMemo(() => {
    const m = new Map<string, Meeting[]>()
    for (const mt of meetings) { const a = m.get(mt.date) ?? []; a.push(mt); m.set(mt.date, a) }
    return m
  }, [meetings])
  const personalByDay = useMemo(() => {
    const m = new Map<string, PersonalEvent[]>()
    for (const pe of personalEvents) { const a = m.get(pe.event_date) ?? []; a.push(pe); m.set(pe.event_date, a) }
    return m
  }, [personalEvents])

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
              {(meetingsByDay.get(cell.dateISO)?.length ?? 0) > 0 && <span style={{ position: 'absolute', top: 3, insetInlineEnd: 3, width: 5, height: 5, borderRadius: '50%', background: 'var(--violet)' }} />}
              {(personalByDay.get(cell.dateISO)?.length ?? 0) > 0 && <span style={{ position: 'absolute', top: 3, insetInlineStart: 3, width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />}
            </button>
          )
        })}
      </div>

      {/* Детализация дня */}
      {selected && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{selected}</div>

          {/* Личные события — только в портале (personal). Приватность на уровне API. */}
          {personal && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-strong)' }}>{t('personal_title')}</span>
              </div>
              {(personalByDay.get(selected) ?? []).map(pe => (
                <div key={pe.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', marginBottom: 6, borderRadius: 8, background: 'var(--accent-tint)', border: '1px solid var(--accent)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--accent-strong)', minWidth: 42 }}>{pe.event_time ?? '—'}</div>
                  <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{pe.title}</div>
                  <button onClick={() => deletePersonal(pe.id)} title={t('personal_delete')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger, #DC2626)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
                </div>
              ))}
              {/* Форма добавления */}
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <input value={peTitle} onChange={e => setPeTitle(e.target.value)} placeholder={t('personal_name_placeholder')}
                  style={{ flex: '1 1 140px', minWidth: 120, padding: '6px 9px', fontSize: 12.5, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)' }} />
                <input type="time" value={peTime} onChange={e => setPeTime(e.target.value)} aria-label={t('personal_time_optional')}
                  style={{ width: 96, padding: '6px 9px', fontSize: 12.5, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)' }} />
                <button onClick={addPersonal} disabled={!peTitle.trim() || peSaving}
                  style={{ padding: '6px 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 8, border: 'none', cursor: (!peTitle.trim() || peSaving) ? 'not-allowed' : 'pointer', background: (!peTitle.trim() || peSaving) ? 'var(--border)' : 'var(--accent)', color: (!peTitle.trim() || peSaving) ? 'var(--text-faint)' : 'var(--accent-contrast, #fff)' }}>
                  {t('personal_save')}
                </button>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 5 }}>🔒 {t('personal_hint')}</div>
            </div>
          )}

          {(meetingsByDay.get(selected) ?? []).map(mt => (
            <div key={mt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', marginBottom: 6, borderRadius: 8, background: 'var(--violet-tint)', border: '1px solid var(--violet)' }}>
              <span>🤝</span>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--violet)', minWidth: 42 }}>{mt.time ?? '—'}</div>
              <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{mt.title}</div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t(`meeting_${mt.status}`, mt.status)}</span>
            </div>
          ))}
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
