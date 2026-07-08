'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import {
  monthGrid,
  appointmentsForDay,
  isBlocked,
  minutesBetween,
} from '@/lib/calendar/calendar'

// ─── Типы данных с API ───────────────────────────────────────────────────────

interface Appointment {
  id: string
  journey_id: string | null
  title: string
  reason: string | null
  starts_at: string
  ends_at: string
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  notes: string | null
  student_name: string | null
  student_hebrew_name: string | null
}
interface Block {
  id: string
  block_date: string
  reason: string | null
}
interface StudentOption {
  journey_id: string
  full_name: string
  hebrew_name: string | null
}

type View = 'month' | 'week'
type Status = Appointment['status']

// ─── Чистые date-хелперы клиента (UTC-арифметика, стабильна к DST) ───────────

const LOCALE_MAP: Record<string, string> = { ru: 'ru-RU', he: 'he-IL', en: 'en-US' }
function localeOf(lang: string): string { return LOCALE_MAP[lang] ?? 'ru-RU' }

function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}` }

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 'HH:mm' из ISO-таймстемпа — берём wall-clock из строки, стабильно к TZ. */
function isoTime(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso)
  return m ? `${m[1]}:${m[2]}` : ''
}

function addDaysISO(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

/** Начало недели (воскресенье), содержащей dateISO. */
function startOfWeekISO(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay() // 0=вс
  return addDaysISO(iso, -dow)
}

export default function CalendarClient() {
  const { lang, isRTL } = useLang()
  const t = useTranslations('calendar')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const locale = localeOf(lang)

  const primary = getModuleColor('dashboard', 'primary')
  const light = getModuleColor('dashboard', 'light')

  const TODAY = useMemo(() => todayISO(), [])

  const [view, setView] = useState<View>('month')
  // Опорная дата внутри текущего периода (для month — любой день месяца).
  const [anchor, setAnchor] = useState<string>(TODAY)

  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Диалоги
  const [formOpen, setFormOpen] = useState(false)
  const [formDate, setFormDate] = useState<string>(TODAY)     // предзаполненный день
  const [editing, setEditing] = useState<Appointment | null>(null) // редактируемая встреча
  const [detail, setDetail] = useState<Appointment | null>(null)   // открытая встреча

  const anchorYear = Number(anchor.slice(0, 4))
  const anchorMonth = Number(anchor.slice(5, 7))

  // Видимый диапазон дат (для запросов и для сетки).
  const weeks = useMemo(() => monthGrid(anchorYear, anchorMonth, 0), [anchorYear, anchorMonth])
  const weekStart = useMemo(() => startOfWeekISO(anchor), [anchor])
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i)),
    [weekStart],
  )

  const range = useMemo(() => {
    if (view === 'month') {
      const flat = weeks.flat()
      return { from: flat[0].dateISO, to: flat[flat.length - 1].dateISO }
    }
    return { from: weekDays[0], to: weekDays[6] }
  }, [view, weeks, weekDays])

  // ─── Загрузка данных ────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const qs = `from=${range.from}&to=${range.to}`
      const [aRes, bRes] = await Promise.all([
        fetch(`/api/calendar/appointments?${qs}`),
        fetch(`/api/calendar/blocks?${qs}`),
      ])
      if (!aRes.ok) {
        const b = await aRes.json().catch(() => ({}))
        setError(b.error ?? t('load_error')); setAppointments([]); setBlocks([]); return
      }
      const aBody = await aRes.json()
      setAppointments(aBody.appointments ?? [])
      if (bRes.ok) {
        const bBody = await bRes.json()
        setBlocks(bBody.blocks ?? [])
      }
    } catch {
      setError(t('load_error'))
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to, t])

  useEffect(() => { load() }, [load])

  // ─── Навигация ──────────────────────────────────────────────────────────────

  function goPrev() {
    if (view === 'month') {
      const m = anchorMonth === 1 ? 12 : anchorMonth - 1
      const y = anchorMonth === 1 ? anchorYear - 1 : anchorYear
      setAnchor(`${y}-${pad2(m)}-01`)
    } else {
      setAnchor(addDaysISO(anchor, -7))
    }
  }
  function goNext() {
    if (view === 'month') {
      const m = anchorMonth === 12 ? 1 : anchorMonth + 1
      const y = anchorMonth === 12 ? anchorYear + 1 : anchorYear
      setAnchor(`${y}-${pad2(m)}-01`)
    } else {
      setAnchor(addDaysISO(anchor, 7))
    }
  }
  function goToday() { setAnchor(TODAY) }

  // ─── Заголовок периода ──────────────────────────────────────────────────────

  const periodLabel = useMemo(() => {
    if (view === 'month') {
      const d = new Date(Date.UTC(anchorYear, anchorMonth - 1, 1))
      return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
    }
    const fmt = (iso: string) =>
      new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', timeZone: 'UTC' })
        .format(new Date(`${iso}T00:00:00Z`))
    return `${fmt(weekDays[0])} — ${fmt(weekDays[6])}`
  }, [view, anchorYear, anchorMonth, weekDays, locale])

  // Короткие названия дней недели (вс…сб), из Intl.
  const weekdayLabels = useMemo(() => {
    // 2024-01-07 — воскресенье; берём 7 дней подряд.
    return Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysISO('2024-01-07', i)
      return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
    })
  }, [locale])

  // ─── Действия ───────────────────────────────────────────────────────────────

  function openNew(date: string) {
    setEditing(null)
    setFormDate(date)
    setFormOpen(true)
  }
  function openEdit(a: Appointment) {
    setEditing(a)
    setFormDate(a.starts_at.slice(0, 10))
    setDetail(null)
    setFormOpen(true)
  }

  async function toggleDayOff(date: string) {
    const existing = blocks.find(b => b.block_date === date)
    try {
      if (existing) {
        const res = await fetch(`/api/calendar/blocks/${existing.id}`, { method: 'DELETE' })
        if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? t('load_error')); return }
      } else {
        const res = await fetch('/api/calendar/blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ block_date: date }),
        })
        if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? t('load_error')); return }
      }
      await load()
    } catch {
      setError(t('load_error'))
    }
  }

  async function changeStatus(a: Appointment, status: Status) {
    try {
      const res = await fetch(`/api/calendar/appointments/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.status === 409) { setError(t('overlap_error')); return }
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? t('load_error')); return }
      setDetail(null)
      await load()
    } catch { setError(t('load_error')) }
  }

  async function deleteAppointment(a: Appointment) {
    if (!window.confirm(t('confirm_delete'))) return
    try {
      const res = await fetch(`/api/calendar/appointments/${a.id}`, { method: 'DELETE' })
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.error ?? t('load_error')); return }
      setDetail(null)
      await load()
    } catch { setError(t('load_error')) }
  }

  // ─── Рендер ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5" dir={isRTL ? 'rtl' : 'ltr'}>
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: t('title') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('dashboard'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(59,130,246,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>{t('subtitle')}</div>
        </div>
        <button
          onClick={() => openNew(view === 'month' ? TODAY : anchor)}
          style={{
            background: '#fff', color: primary, fontWeight: 600, fontSize: 13,
            border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer',
          }}
        >
          + {t('new_appointment')}
        </button>
      </div>

      {/* Toolbar: navigation + view toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={goPrev} style={navBtn} aria-label={t('prev')}>
            <span style={{ fontSize: 16 }}>{isRTL ? '›' : '‹'}</span>
          </button>
          <button onClick={goToday} style={{ ...navBtn, width: 'auto', padding: '0 14px', fontSize: 13, fontWeight: 600 }}>
            {t('today')}
          </button>
          <button onClick={goNext} style={navBtn} aria-label={t('next')}>
            <span style={{ fontSize: 16 }}>{isRTL ? '‹' : '›'}</span>
          </button>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#111827', marginInlineStart: 6, textTransform: 'capitalize' }}>
            {periodLabel}
          </span>
        </div>

        <div style={{ display: 'inline-flex', background: '#F3F4F6', borderRadius: 8, padding: 3 }}>
          {(['month', 'week'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: view === v ? '#fff' : 'transparent',
                color: view === v ? primary : '#6B7280',
                boxShadow: view === v ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {t(`view.${v}`)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 13, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>{tCommon('loading')}</div>
      ) : view === 'month' ? (
        <MonthView
          weeks={weeks}
          weekdayLabels={weekdayLabels}
          appointments={appointments}
          blocks={blocks}
          today={TODAY}
          primary={primary}
          light={light}
          isRTL={isRTL}
          onDayNew={openNew}
          onToggleDayOff={toggleDayOff}
          onOpen={setDetail}
          t={t}
        />
      ) : (
        <WeekView
          days={weekDays}
          appointments={appointments}
          blocks={blocks}
          today={TODAY}
          primary={primary}
          locale={locale}
          onDayNew={openNew}
          onToggleDayOff={toggleDayOff}
          onOpen={setDetail}
          t={t}
        />
      )}

      {formOpen && (
        <AppointmentForm
          editing={editing}
          defaultDate={formDate}
          onClose={() => setFormOpen(false)}
          onSaved={async () => { setFormOpen(false); await load() }}
          t={t}
          tCommon={tCommon}
          isRTL={isRTL}
          primary={primary}
        />
      )}

      {detail && (
        <AppointmentDetail
          a={detail}
          onClose={() => setDetail(null)}
          onEdit={() => openEdit(detail)}
          onStatus={(s) => changeStatus(detail, s)}
          onDelete={() => deleteAppointment(detail)}
          t={t}
          tCommon={tCommon}
          locale={locale}
          primary={primary}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Статус-стили чипа
// ─────────────────────────────────────────────

function statusStyle(status: Status, primary: string, light: string): { bg: string; color: string; strike: boolean } {
  switch (status) {
    case 'completed': return { bg: '#D1FAE5', color: '#047857', strike: false }
    case 'cancelled': return { bg: '#F3F4F6', color: '#9CA3AF', strike: true }
    case 'no_show':   return { bg: '#FEF3C7', color: '#B45309', strike: false }
    default:          return { bg: light, color: primary, strike: false }
  }
}

// ─────────────────────────────────────────────
// Месячная сетка
// ─────────────────────────────────────────────

function MonthView({
  weeks, weekdayLabels, appointments, blocks, today, primary, light, isRTL,
  onDayNew, onToggleDayOff, onOpen, t,
}: {
  weeks: { dateISO: string; inMonth: boolean }[][]
  weekdayLabels: string[]
  appointments: Appointment[]
  blocks: Block[]
  today: string
  primary: string
  light: string
  isRTL: boolean
  onDayNew: (d: string) => void
  onToggleDayOff: (d: string) => void
  onOpen: (a: Appointment) => void
  t: (k: string, f?: string) => string
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #E5E7EB' }}>
        {weekdayLabels.map((w, i) => (
          <div key={i} style={{
            textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#9CA3AF',
            textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 4px',
          }}>{w}</div>
        ))}
      </div>

      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {week.map(cell => {
            const dayAppts = appointmentsForDay(appointments, cell.dateISO)
            const blocked = isBlocked(blocks, cell.dateISO)
            const isToday = cell.dateISO === today
            const dayNum = Number(cell.dateISO.slice(8, 10))
            return (
              <div
                key={cell.dateISO}
                style={{
                  minHeight: 104, borderInlineEnd: '1px solid #F3F4F6', borderBottom: '1px solid #F3F4F6',
                  padding: 6, position: 'relative', background: blocked ? '#FAFAF9' : '#fff',
                  opacity: cell.inMonth ? 1 : 0.45,
                  backgroundImage: blocked
                    ? 'repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(107,114,128,0.06) 6px, rgba(107,114,128,0.06) 12px)'
                    : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      fontSize: 12, fontWeight: isToday ? 700 : 500,
                      color: isToday ? '#fff' : '#374151',
                      background: isToday ? primary : 'transparent',
                      borderRadius: 999, width: 22, height: 22,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >{dayNum}</span>
                  <span style={{ display: 'inline-flex', gap: 2 }}>
                    {blocked && (
                      <span title={t('day_off')} style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', letterSpacing: 0.3 }}>
                        {t('day_off_short')}
                      </span>
                    )}
                    <button
                      onClick={() => onDayNew(cell.dateISO)}
                      title={t('new_appointment')}
                      style={dayAddBtn}
                    >+</button>
                  </span>
                </div>

                <div style={{ marginTop: 4, display: 'grid', gap: 3 }}>
                  {dayAppts.slice(0, 3).map(a => {
                    const st = statusStyle(a.status, primary, light)
                    return (
                      <button
                        key={a.id}
                        onClick={() => onOpen(a)}
                        style={{
                          textAlign: isRTL ? 'right' : 'left', border: 'none', cursor: 'pointer',
                          background: st.bg, color: st.color, borderRadius: 5, padding: '2px 6px',
                          fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          textDecoration: st.strike ? 'line-through' : 'none',
                        }}
                      >
                        {isoTime(a.starts_at)} {a.title}
                      </button>
                    )
                  })}
                  {dayAppts.length > 3 && (
                    <span style={{ fontSize: 10, color: '#9CA3AF', paddingInlineStart: 2 }}>
                      +{dayAppts.length - 3}
                    </span>
                  )}
                </div>

                {/* Быстрая пометка выходного при наведении — через двойной клик по дню */}
                <button
                  onClick={() => onToggleDayOff(cell.dateISO)}
                  title={blocked ? t('remove_day_off') : t('mark_day_off')}
                  style={{
                    position: 'absolute', bottom: 4, insetInlineEnd: 4, fontSize: 10, color: blocked ? '#B45309' : '#C4C9D0',
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 2,
                  }}
                >
                  {blocked ? '⊘' : '○'}
                </button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// Недельная / agenda-раскладка
// ─────────────────────────────────────────────

function WeekView({
  days, appointments, blocks, today, primary, locale,
  onDayNew, onToggleDayOff, onOpen, t,
}: {
  days: string[]
  appointments: Appointment[]
  blocks: Block[]
  today: string
  primary: string
  locale: string
  onDayNew: (d: string) => void
  onToggleDayOff: (d: string) => void
  onOpen: (a: Appointment) => void
  t: (k: string, f?: string) => string
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {days.map(day => {
        const dayAppts = appointmentsForDay(appointments, day)
        const blocked = isBlocked(blocks, day)
        const isToday = day === today
        const label = new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'short', timeZone: 'UTC' })
          .format(new Date(`${day}T00:00:00Z`))
        return (
          <div key={day} style={{
            background: '#fff', border: `1px solid ${isToday ? primary : '#E5E7EB'}`, borderRadius: 12, padding: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: isToday ? primary : '#111827', textTransform: 'capitalize' }}>
                  {label}
                </span>
                {blocked && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#B45309', background: '#FEF3C7', borderRadius: 999, padding: '1px 8px' }}>
                    {t('day_off')}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => onToggleDayOff(day)} style={smallLink}>
                  {blocked ? t('remove_day_off') : t('mark_day_off')}
                </button>
                <button onClick={() => onDayNew(day)} style={{ ...smallLink, color: primary }}>
                  + {t('new_appointment')}
                </button>
              </div>
            </div>
            {dayAppts.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9CA3AF' }}>{t('empty_day')}</div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {dayAppts.map(a => {
                  const st = statusStyle(a.status, primary, '#DBEAFE')
                  const mins = minutesBetween(a.starts_at, a.ends_at)
                  const who = a.student_name || a.student_hebrew_name
                  return (
                    <button
                      key={a.id}
                      onClick={() => onOpen(a)}
                      style={{
                        textAlign: 'start', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                        background: '#F9FAFB', border: '1px solid #F3F4F6', borderRadius: 8, padding: '8px 12px',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', minWidth: 92 }}>
                        {isoTime(a.starts_at)}–{isoTime(a.ends_at)}
                      </span>
                      <span style={{
                        fontSize: 13, fontWeight: 600, color: st.color, flex: 1,
                        textDecoration: st.strike ? 'line-through' : 'none',
                      }}>
                        {a.title}
                        {who && <span style={{ fontWeight: 400, color: '#6B7280' }}> · {who}</span>}
                      </span>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{mins} {t('minutes')}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────
// Диалог создания / редактирования
// ─────────────────────────────────────────────

function AppointmentForm({
  editing, defaultDate, onClose, onSaved, t, tCommon, isRTL, primary,
}: {
  editing: Appointment | null
  defaultDate: string
  onClose: () => void
  onSaved: () => void
  t: (k: string, f?: string) => string
  tCommon: (k: string, f?: string) => string
  isRTL: boolean
  primary: string
}) {
  const [title, setTitle] = useState(editing?.title ?? '')
  const [reason, setReason] = useState(editing?.reason ?? '')
  const [date, setDate] = useState(editing ? editing.starts_at.slice(0, 10) : defaultDate)
  const [start, setStart] = useState(editing ? isoTime(editing.starts_at) : '09:00')
  const [end, setEnd] = useState(editing ? isoTime(editing.ends_at) : '09:30')
  const [journeyId, setJourneyId] = useState<string | null>(editing?.journey_id ?? null)
  const [studentLabel, setStudentLabel] = useState<string>(
    editing?.student_name || editing?.student_hebrew_name || '',
  )

  const [studentSearch, setStudentSearch] = useState('')
  const [studentOpts, setStudentOpts] = useState<StudentOption[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Поиск студентов с дебаунсом.
  useEffect(() => {
    if (!pickerOpen) return
    const h = setTimeout(async () => {
      try {
        const res = await fetch(`/api/persons/students?pageSize=20&search=${encodeURIComponent(studentSearch)}`)
        if (!res.ok) return
        const b = await res.json()
        setStudentOpts(b.students ?? [])
      } catch { /* оставляем прежний список */ }
    }, 250)
    return () => clearTimeout(h)
  }, [studentSearch, pickerOpen])

  async function submit() {
    setErr(null)
    if (!title.trim()) { setErr(t('err_title_required')); return }
    if (end <= start) { setErr(t('err_end_after_start')); return }
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        journey_id: journeyId,
        starts_at: `${date}T${start}`,
        ends_at: `${date}T${end}`,
        reason: reason.trim() || null,
      }
      const res = editing
        ? await fetch(`/api/calendar/appointments/${editing.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/calendar/appointments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      if (res.status === 409) { setErr(t('overlap_error')); return }
      if (!res.ok) { const b = await res.json().catch(() => ({})); setErr(b.error ?? t('load_error')); return }
      onSaved()
    } catch {
      setErr(t('load_error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <div style={dialog} onClick={e => e.stopPropagation()} dir={isRTL ? 'rtl' : 'ltr'}>
        <h2 style={dialogTitle}>{editing ? t('edit_appointment') : t('new_appointment')}</h2>

        <Field label={t('form_title')}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('form_title_ph')} style={input} autoFocus />
        </Field>

        <Field label={t('form_student')}>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => { setPickerOpen(o => !o); if (!pickerOpen) setStudentSearch('') }}
              style={{ ...input, textAlign: isRTL ? 'right' : 'left', cursor: 'pointer', color: studentLabel ? '#1F2937' : '#9CA3AF' }}
            >
              {studentLabel || t('form_student_none')}
            </button>
            {journeyId && (
              <button
                type="button"
                onClick={() => { setJourneyId(null); setStudentLabel('') }}
                style={{ position: 'absolute', top: 8, insetInlineEnd: 10, fontSize: 12, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer' }}
              >✕</button>
            )}
            {pickerOpen && (
              <div style={{
                position: 'absolute', top: '100%', insetInlineStart: 0, insetInlineEnd: 0, zIndex: 20,
                background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                maxHeight: 220, overflowY: 'auto',
              }}>
                <input
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  placeholder={t('form_student_search')}
                  style={{ ...input, borderRadius: 0, border: 'none', borderBottom: '1px solid #F3F4F6' }}
                  autoFocus
                />
                {studentOpts.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9CA3AF', padding: '8px 12px' }}>{t('form_student_empty')}</div>
                ) : studentOpts.map(s => (
                  <button
                    key={s.journey_id}
                    type="button"
                    onClick={() => {
                      setJourneyId(s.journey_id)
                      setStudentLabel(s.full_name || s.hebrew_name || '')
                      setPickerOpen(false)
                    }}
                    style={{
                      display: 'block', width: '100%', textAlign: isRTL ? 'right' : 'left',
                      fontSize: 13, color: '#1F2937', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F9FAFB' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                  >
                    {s.full_name || s.hebrew_name || '—'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Field label={t('form_date')}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={input} />
          </Field>
          <Field label={t('form_start')}>
            <input type="time" value={start} onChange={e => setStart(e.target.value)} style={input} />
          </Field>
          <Field label={t('form_end')}>
            <input type="time" value={end} onChange={e => setEnd(e.target.value)} style={input} />
          </Field>
        </div>

        <Field label={t('form_reason')}>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder={t('form_reason_ph')} rows={2} style={{ ...input, resize: 'vertical' }} />
        </Field>

        {err && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 4 }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={btnGhost}>{tCommon('cancel')}</button>
          <button onClick={submit} disabled={saving} style={{ ...btnPrimary(primary), opacity: saving ? 0.6 : 1 }}>
            {saving ? tCommon('loading') : tCommon('save')}
          </button>
        </div>
      </div>
    </Overlay>
  )
}

// ─────────────────────────────────────────────
// Диалог просмотра встречи
// ─────────────────────────────────────────────

function AppointmentDetail({
  a, onClose, onEdit, onStatus, onDelete, t, tCommon, locale, primary,
}: {
  a: Appointment
  onClose: () => void
  onEdit: () => void
  onStatus: (s: Status) => void
  onDelete: () => void
  t: (k: string, f?: string) => string
  tCommon: (k: string, f?: string) => string
  locale: string
  primary: string
}) {
  const st = statusStyle(a.status, primary, '#DBEAFE')
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${a.starts_at.slice(0, 10)}T00:00:00Z`))
  const mins = minutesBetween(a.starts_at, a.ends_at)
  const who = a.student_name || a.student_hebrew_name

  return (
    <Overlay onClose={onClose}>
      <div style={dialog} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ ...dialogTitle, marginBottom: 4, textDecoration: st.strike ? 'line-through' : 'none' }}>{a.title}</h2>
          <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' }}>
            {t(`status.${a.status}`)}
          </span>
        </div>

        <div style={{ fontSize: 13, color: '#374151', marginTop: 8, textTransform: 'capitalize' }}>{dateLabel}</div>
        <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>
          {isoTime(a.starts_at)}–{isoTime(a.ends_at)} · {mins} {t('minutes')}
        </div>
        {who && <div style={{ fontSize: 13, color: '#374151', marginTop: 6 }}><b>{t('form_student')}:</b> {who}</div>}
        {a.reason && <div style={{ fontSize: 13, color: '#374151', marginTop: 6 }}><b>{t('form_reason')}:</b> {a.reason}</div>}

        {/* Status actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
          <button onClick={() => onStatus('completed')} style={statusBtn('#047857', '#D1FAE5')}>{t('mark_completed')}</button>
          <button onClick={() => onStatus('cancelled')} style={statusBtn('#6B7280', '#F3F4F6')}>{t('mark_cancelled')}</button>
          <button onClick={() => onStatus('no_show')} style={statusBtn('#B45309', '#FEF3C7')}>{t('mark_no_show')}</button>
          {a.status !== 'scheduled' && (
            <button onClick={() => onStatus('scheduled')} style={statusBtn(primary, '#DBEAFE')}>{t('mark_scheduled')}</button>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16, borderTop: '1px solid #F3F4F6', paddingTop: 14 }}>
          <button onClick={onDelete} style={{ ...btnGhost, color: '#DC2626' }}>{tCommon('delete')}</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btnGhost}>{tCommon('back')}</button>
            <button onClick={onEdit} style={btnPrimary(primary)}>{tCommon('edit')}</button>
          </div>
        </div>
      </div>
    </Overlay>
  )
}

// ─────────────────────────────────────────────
// Мелкие переиспользуемые куски
// ─────────────────────────────────────────────

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

// ─── Инлайн-стили ─────────────────────────────────────────────────────────────

const navBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff',
  color: '#374151', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
const dayAddBtn: React.CSSProperties = {
  fontSize: 14, lineHeight: 1, color: '#C4C9D0', background: 'transparent', border: 'none',
  cursor: 'pointer', padding: '0 2px', fontWeight: 700,
}
const smallLink: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer',
}
const dialog: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460,
  maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
}
const dialogTitle: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: '#111827', margin: 0 }
const input: React.CSSProperties = {
  width: '100%', fontSize: 13, padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: 8, color: '#1F2937',
}
const btnGhost: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: '#6B7280', background: '#fff', border: '1px solid #E5E7EB',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
}
function btnPrimary(primary: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, color: '#fff', background: primary, border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }
}
function statusBtn(color: string, bg: string): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color, background: bg, border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }
}
