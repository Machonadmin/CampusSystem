'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import { conflictedSlotIds, type ScheduleConflict } from '@/lib/education/schedule-conflicts'
import { toast } from '@/components/ui/toast'
import { SkeletonRows } from '@/components/ui/Skeleton'

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
  approval_status?: 'active' | 'pending'
}
interface Unit { id: string; name: string }

const DAY_ORDER = [7, 1, 2, 3, 4, 5, 6] // Sun..Sat (Israel week)
const hhmm = (t: string) => t.slice(0, 5)
// Кодеш-время, ожидающее אישור מנהל — золото модуля «еврейство».
const PENDING_GOLD = '#ca8a04'
const PENDING_TINT = 'rgba(202,138,4,0.13)'

export default function TimetablePage() {
  const t = useTranslations('education.timetable')
  const tNav = useTranslations('navigation')

  const [slots, setSlots] = useState<Slot[]>([])
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [unit, setUnit] = useState('')
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overDay, setOverDay] = useState<number | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async (u: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/education/timetable${u ? `?unit=${u}` : ''}`)
      if (res.ok) { const b = await res.json(); setSlots(b.slots ?? []); setConflicts(b.conflicts ?? []); if (b.units) setUnits(b.units); setCanEdit(!!b.can_edit) }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(unit) }, [unit, load])

  // Перетаскивание слота в другой день недели → PATCH day_of_week (время/комната
  // те же). Не блокируем при конфликте — предупреждаем (решение владельца ז).
  const moveToDay = useCallback(async (slotId: string, day: number) => {
    const slot = slots.find(s => s.id === slotId)
    if (!slot || slot.day_of_week === day) return
    setSavingId(slotId)
    // Оптимистично двигаем в UI.
    setSlots(prev => prev.map(s => s.id === slotId ? { ...s, day_of_week: day } : s))
    try {
      const res = await fetch(`/api/education/schedule/slots/${slotId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day_of_week: day }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setSlots(prev => prev.map(s => s.id === slotId ? { ...s, day_of_week: slot.day_of_week } : s)) // откат
        toast(b.error || t('move_failed', 'לא ניתן להזיז'), 'error')
        return
      }
      const b = await res.json().catch(() => ({})) as { conflicts?: ScheduleConflict[] }
      if (b.conflicts?.length) toast(t('moved_with_conflict', 'הוזז — יש התנגשות'), 'info')
      else toast(t('moved_ok', 'הוזז'), 'success')
      await load(unit) // пересчитать все конфликты в сетке
    } catch {
      setSlots(prev => prev.map(s => s.id === slotId ? { ...s, day_of_week: slot.day_of_week } : s))
      toast(t('move_failed', 'לא ניתן להזיז'), 'error')
    } finally { setSavingId(null) }
  }, [slots, load, unit, t])

  const conflicted = useMemo(() => conflictedSlotIds(conflicts), [conflicts])
  // slotId → набор видов конфликта (teacher/room/students), чтобы показать какой именно.
  const kindsBySlot = useMemo(() => {
    const m = new Map<string, Set<ScheduleConflict['kind']>>()
    for (const c of conflicts) {
      for (const id of [c.slot_a, c.slot_b]) {
        const set = m.get(id) ?? new Set<ScheduleConflict['kind']>()
        set.add(c.kind); m.set(id, set)
      }
    }
    return m
  }, [conflicts])
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

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '16px 24px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{t('title')}</h1>
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
        {canEdit && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>· {t('drag_hint', 'גרור שיעור ליום אחר')}</span>}
      </div>

      {loading ? (
        <SkeletonRows avatar={false} rows={6} />
      ) : slots.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>{t('no_slots')}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${DAY_ORDER.length}, minmax(150px, 1fr))`, gap: 10, minWidth: 900 }}>
            {DAY_ORDER.map(day => (
              <div key={day}
                onDragOver={canEdit ? (e => { e.preventDefault(); setOverDay(day) }) : undefined}
                onDragLeave={canEdit ? (() => setOverDay(prev => prev === day ? null : prev)) : undefined}
                onDrop={canEdit ? (e => { e.preventDefault(); setOverDay(null); if (dragId) moveToDay(dragId, day) }) : undefined}
                style={{ borderRadius: 10, transition: 'background 0.12s', background: overDay === day && dragId ? 'var(--accent-tint)' : 'transparent', padding: 2 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0', marginBottom: 6, borderBottom: '2px solid var(--border)' }}>
                  {t(`days.${day}`, String(day))}
                </div>
                <div style={{ display: 'grid', gap: 8, minHeight: 40 }}>
                  {(byDay.get(day) ?? []).map(s => {
                    const bad = conflicted.has(s.id)
                    const pending = s.approval_status === 'pending'
                    return (
                      <div key={s.id}
                        draggable={canEdit}
                        onDragStart={canEdit ? (e => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move' }) : undefined}
                        onDragEnd={canEdit ? (() => { setDragId(null); setOverDay(null) }) : undefined}
                        style={{
                        background: 'var(--surface)', borderRadius: 10, padding: '9px 11px',
                        border: bad ? '1px solid var(--danger)' : pending ? `1px dashed ${PENDING_GOLD}` : '1px solid var(--border)',
                        boxShadow: bad ? '0 0 0 3px var(--danger-tint)' : 'var(--shadow)',
                        cursor: canEdit ? 'grab' : 'default',
                        opacity: savingId === s.id ? 0.5 : dragId === s.id ? 0.4 : 1,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--accent-strong)' }}>
                            {hhmm(s.start_time)}–{hhmm(s.end_time)}
                          </span>
                          {pending && (
                            <span style={{ fontSize: 9.5, fontWeight: 700, color: PENDING_GOLD, background: PENDING_TINT, padding: '1px 6px', borderRadius: 5, whiteSpace: 'nowrap' }}>
                              {t('pending', 'ממתין לאישור')}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{s.class_group_name}{s.subject ? ` · ${s.subject}` : ''}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                          {s.teachers.length > 0 && <span>{s.teachers.join(', ')}</span>}
                          {s.room && <span>{s.teachers.length ? ' · ' : ''}{t('room')} {s.room}</span>}
                        </div>
                        {bad && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {[...(kindsBySlot.get(s.id) ?? [])].map(k => (
                              <span key={k} style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', background: 'var(--danger-tint)', padding: '2px 6px', borderRadius: 6 }}>
                                ⚠ {t(k === 'teacher' ? 'teacher_dbl' : k === 'room' ? 'room_dbl' : 'students_dbl')}
                              </span>
                            ))}
                          </div>
                        )}
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
