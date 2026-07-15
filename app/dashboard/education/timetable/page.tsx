'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { conflictedSlotIds, type ScheduleConflict } from '@/lib/education/schedule-conflicts'

interface Slot {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  room: string | null
  class_group_name: string
  subject: string | null
  unit: string | null
  teachers: string[]
}
interface Unit { id: string; name: string }

const DAY_ORDER = [7, 1, 2, 3, 4, 5, 6] // Sun..Sat (Israel week)
const hhmm = (t: string) => t.slice(0, 5)

export default function TimetablePage() {
  const t = useTranslations('education.timetable')
  const tNav = useTranslations('navigation')
  const accent = getModuleColor('education')

  const [slots, setSlots] = useState<Slot[]>([])
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [unit, setUnit] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (u: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/education/timetable${u ? `?unit=${u}` : ''}`)
      if (res.ok) { const b = await res.json(); setSlots(b.slots ?? []); setConflicts(b.conflicts ?? []); if (b.units) setUnits(b.units) }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(unit) }, [unit, load])

  const conflicted = useMemo(() => conflictedSlotIds(conflicts), [conflicts])
  const byDay = useMemo(() => {
    const m = new Map<number, Slot[]>()
    for (const s of slots) { const arr = m.get(s.day_of_week) ?? []; arr.push(s); m.set(s.day_of_week, arr) }
    for (const arr of m.values()) arr.sort((a, b) => a.start_time.localeCompare(b.start_time))
    return m
  }, [slots])

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '12px 24px' }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{t('title')}</h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{t('subtitle')}</p>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={unit} onChange={e => setUnit(e.target.value)}
          style={{ padding: '8px 12px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }}>
          <option value="">{t('all_units')}</option>
          {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <span style={{ fontSize: 13, fontWeight: 600, color: conflicts.length ? 'var(--danger)' : 'var(--success)' }}>
          {conflicts.length === 0 ? t('conflicts_none') : t('conflicts_count', '{n}').replace('{n}', String(conflicts.length))}
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>…</div>
      ) : slots.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('no_slots')}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${DAY_ORDER.length}, minmax(150px, 1fr))`, gap: 10, minWidth: 900 }}>
            {DAY_ORDER.map(day => (
              <div key={day}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0', marginBottom: 6, borderBottom: '2px solid var(--border)' }}>
                  {t(`days.${day}`, String(day))}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {(byDay.get(day) ?? []).map(s => {
                    const bad = conflicted.has(s.id)
                    return (
                      <div key={s.id} style={{
                        background: 'var(--surface)', borderRadius: 10, padding: '9px 11px',
                        border: `1px solid ${bad ? 'var(--danger)' : 'var(--border)'}`,
                        boxShadow: bad ? '0 0 0 3px var(--danger-tint)' : 'var(--shadow)',
                      }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--accent-strong)' }}>
                          {hhmm(s.start_time)}–{hhmm(s.end_time)}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{s.class_group_name}{s.subject ? ` · ${s.subject}` : ''}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                          {s.teachers.length > 0 && <span>{s.teachers.join(', ')}</span>}
                          {s.room && <span>{s.teachers.length ? ' · ' : ''}{t('room')} {s.room}</span>}
                        </div>
                        {bad && <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--danger)', marginTop: 4 }}>⚠ {t('conflict')}</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
