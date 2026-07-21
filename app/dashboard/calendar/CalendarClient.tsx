'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import {
  monthGrid,
  isBlocked,
  minutesBetween,
  mergeDayEvents,
  toHHmm,
} from '@/lib/calendar/calendar'
import {
  expandScheduleSlots,
  suppressCoveredInstances,
  type ScheduleSlot,
  type ScheduleInstance,
} from '@/lib/calendar/schedule'
import { birthdayInstances, type BirthdayInstance } from '@/lib/calendar/birthday'
import { formatHebrewDate, hebrewDayNumber } from '@/lib/calendar/hebrew'
import { formatDate } from '@/lib/i18n/format-date'
import AddToCalendar from '@/components/calendar/AddToCalendar'
import type {
  Appointment, Block, Lesson, Task, CalEvent, StudentOption, View, Status,
} from './calendar-types'

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

/** Название предмета урока: иврит, если язык he и name_he задан — как в Education. */
function subjectLabel(l: Lesson, lang: string): string {
  if (lang === 'he' && l.subject_he) return l.subject_he
  return l.subject
}

// Палитра урока — education-зелёный. Намеренно светлее «завершённой» встречи
// (#D1FAE5) плюс сплошная левая полоса, чтобы урок не путался ни с одним
// статусом встречи.
const LESSON_BG = '#ECFDF5'
const LESSON_FG = '#047857'
const LESSON_ACCENT = '#10B981'

// Палитра повторяющегося слота расписания («плановое занятие») — тот же зелёный,
// но легче и ПУНКТИРНОЙ полосой, чтобы читалось как «шаблон/повтор», а не урок.
const SCHEDULE_BG = '#F6FEFB'
const SCHEDULE_FG = '#059669'
const SCHEDULE_ACCENT = '#6EE7B7'

// Палитра задачи — амбер модуля Tasks (getModuleColor('tasks')).
const TASK_BG = getModuleColor('tasks', 'light')      // #FEF3C7
const TASK_ACCENT = getModuleColor('tasks', 'primary') // #F59E0B
const TASK_FG = '#B45309'

// Палитра дня рождения — праздничный розовый с эмодзи-тортом. Намеренно вне
// синей/зелёной/амбер гаммы остальных четырёх видов, чтобы читалось как «личный
// праздник», а не рабочее событие. День рождения read-only (нередактируемый чип).
const BIRTHDAY_BG = '#FCE7F3'
const BIRTHDAY_FG = '#BE185D'
const BIRTHDAY_ACCENT = '#EC4899'

// Название предмета слота расписания: иврит, если язык he и он задан.
function scheduleSubjectLabel(s: ScheduleInstance, lang: string): string {
  if (lang === 'he' && s.subject_name_he) return s.subject_name_he
  return s.subject_name
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
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [calEvents, setCalEvents] = useState<CalEvent[]>([])
  const [detailEvent, setDetailEvent] = useState<CalEvent | null>(null)
  // Дата рождения владельца календаря (persons.birth_date). Статична — грузится
  // ОДИН раз при монтировании, НЕ перезапрашивается при навигации по месяцам.
  const [birthDate, setBirthDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Персональный тумблер еврейских дат. Хранится в localStorage per-user, читается
  // после монтирования (SSR-safe: typeof window). БД/миграции не нужны.
  const [hebrewDates, setHebrewDates] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      setHebrewDates(window.localStorage.getItem('calendar:hebrewDates') === '1')
    } catch { /* localStorage недоступен — оставляем выкл. */ }
  }, [])
  function toggleHebrewDates() {
    setHebrewDates(prev => {
      const next = !prev
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('calendar:hebrewDates', next ? '1' : '0')
        }
      } catch { /* игнорируем недоступность localStorage */ }
      return next
    })
  }

  // Диалоги
  const [formOpen, setFormOpen] = useState(false)
  const [formDate, setFormDate] = useState<string>(TODAY)     // предзаполненный день
  const [editing, setEditing] = useState<Appointment | null>(null) // редактируемая встреча
  const [detail, setDetail] = useState<Appointment | null>(null)   // открытая встреча
  const [detailLesson, setDetailLesson] = useState<Lesson | null>(null) // read-only урок
  const [detailTask, setDetailTask] = useState<Task | null>(null)  // read-only задача
  const [detailSchedule, setDetailSchedule] = useState<ScheduleInstance | null>(null) // слот
  const [dayOpen, setDayOpen] = useState<string | null>(null) // открытый день (детали дня)

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

  // Повторяющиеся слоты → конкретные экземпляры на видимый диапазон, минус те,
  // что уже перекрыты реальным уроком той же группы/даты/времени. Обе операции
  // чистые (schedule.ts) и покрыты юнит-тестами.
  const scheduleInstances = useMemo(() => {
    const expanded = expandScheduleSlots(slots, range.from, range.to)
    return suppressCoveredInstances(
      expanded,
      lessons.map(l => ({ class_group_id: l.class_group_id, date: l.date, time: l.time })),
    )
  }, [slots, range.from, range.to, lessons])

  // День рождения → экземпляры на видимый диапазон. Чистая логика (birthday.ts),
  // покрыта юнит-тестами. birth_date статична, поэтому пересчёт зависит только от
  // диапазона, а не от повторной загрузки данных.
  const birthdays = useMemo(
    () => birthdayInstances(birthDate, range.from, range.to),
    [birthDate, range.from, range.to],
  )

  // ─── Загрузка данных ────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const qs = `from=${range.from}&to=${range.to}`
      const [aRes, bRes, lRes, tRes, sRes, eRes] = await Promise.all([
        fetch(`/api/calendar/appointments?${qs}`),
        fetch(`/api/calendar/blocks?${qs}`),
        fetch(`/api/calendar/lessons?${qs}`),
        fetch(`/api/calendar/tasks?${qs}`),
        fetch(`/api/calendar/schedule?${qs}`),
        fetch(`/api/calendar/events?${qs}`),
      ])
      if (!aRes.ok) {
        const b = await aRes.json().catch(() => ({}))
        setError(b.error ?? t('load_error'))
        setAppointments([]); setBlocks([]); setLessons([]); setTasks([]); setSlots([]); return
      }
      const aBody = await aRes.json()
      setAppointments(aBody.appointments ?? [])
      if (bRes.ok) {
        const bBody = await bRes.json()
        setBlocks(bBody.blocks ?? [])
      }
      // Уроки/задачи/расписание — вспомогательные read-only слои: сбой любого
      // из них НЕ рушит календарь, просто этот слой пуст.
      if (lRes.ok) {
        const lBody = await lRes.json()
        setLessons(lBody.lessons ?? [])
      } else {
        setLessons([])
      }
      if (tRes.ok) {
        const tBody = await tRes.json()
        setTasks(tBody.tasks ?? [])
      } else {
        setTasks([])
      }
      if (sRes.ok) {
        const sBody = await sRes.json()
        setSlots(sBody.slots ?? [])
      } else {
        setSlots([])
      }
      if (eRes.ok) {
        const eBody = await eRes.json()
        setCalEvents(eBody.events ?? [])
      } else {
        setCalEvents([])
      }
    } catch {
      setError(t('load_error'))
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to, t])

  useEffect(() => { load() }, [load])

  // Дата рождения — статичный личный факт: грузим ОДИН раз при монтировании и
  // больше не трогаем при навигации. Сбой не рушит календарь: слой просто пуст.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/calendar/birthday')
        if (!res.ok) return
        const b = await res.json()
        if (!cancelled) setBirthDate(b.birth_date ?? null)
      } catch { /* ДР — вспомогательный слой: сбой игнорируем */ }
    })()
    return () => { cancelled = true }
  }, [])

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

  // Еврейская подпись периода (ДОПОЛНИТЕЛЬНО к григорианской), когда тумблер вкл.
  const hebrewPeriodLabel = useMemo(() => {
    if (!hebrewDates) return ''
    if (view === 'month') return formatHebrewDate(`${anchorYear}-${pad2(anchorMonth)}-01`)
    return `${formatHebrewDate(weekDays[0])} — ${formatHebrewDate(weekDays[6])}`
  }, [hebrewDates, view, anchorYear, anchorMonth, weekDays])

  // Полная локализованная дата «сегодня» для шапки (пн/чт/…, число, месяц, год).
  // Тот же проверенный паттерн, что и в WeekView: UTC-полночь → без off-by-one.
  const todayLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${TODAY}T00:00:00Z`)),
    [locale, TODAY],
  )

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
          <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8, textTransform: 'capitalize' }}>{todayLabel}</div>
          {hebrewDates && (
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{formatHebrewDate(TODAY)}</div>
          )}
        </div>
        <button
          onClick={() => openNew(view === 'month' ? TODAY : anchor)}
          style={{
            background: 'var(--surface)', color: primary, fontWeight: 600, fontSize: 13,
            border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer',
          }}
        >
          + {t('new_appointment')}
        </button>
        <AddToCalendar variant="button" onAdded={load} />
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
          <span style={{ display: 'inline-flex', flexDirection: 'column', marginInlineStart: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>
              {periodLabel}
            </span>
            {hebrewPeriodLabel && (
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-faint)' }}>{hebrewPeriodLabel}</span>
            )}
          </span>
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={toggleHebrewDates}
            title={t('hebrew_dates')}
            aria-pressed={hebrewDates}
            style={{
              fontSize: 14, fontWeight: 700, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${hebrewDates ? primary : 'var(--border)'}`,
              background: hebrewDates ? light : 'var(--surface)',
              color: hebrewDates ? primary : 'var(--text-muted)',
            }}
          >
            {t('hebrew_short')}
          </button>

          <div style={{ display: 'inline-flex', background: 'var(--surface-2)', borderRadius: 8, padding: 3 }}>
            {(['month', 'week'] as View[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  fontSize: 13, fontWeight: 600, padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: view === v ? 'var(--surface)' : 'transparent',
                  color: view === v ? primary : 'var(--text-muted)',
                  boxShadow: view === v ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {t(`view.${v}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Legend t={t} primary={primary} />

      {error && (
        <div style={{ fontSize: 13, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : view === 'month' ? (
        <MonthView
          weeks={weeks}
          weekdayLabels={weekdayLabels}
          appointments={appointments}
          blocks={blocks}
          lessons={lessons}
          schedule={scheduleInstances}
          tasks={tasks}
          birthdays={birthdays}
          calEvents={calEvents}
          today={TODAY}
          primary={primary}
          light={light}
          isRTL={isRTL}
          hebrewDates={hebrewDates}
          onDayNew={openNew}
          onToggleDayOff={toggleDayOff}
          onOpen={setDetail}
          onOpenLesson={setDetailLesson}
          onOpenTask={setDetailTask}
          onOpenSchedule={setDetailSchedule}
          onOpenEvent={setDetailEvent}
          onOpenDay={setDayOpen}
          t={t}
        />
      ) : (
        <WeekView
          days={weekDays}
          appointments={appointments}
          blocks={blocks}
          lessons={lessons}
          schedule={scheduleInstances}
          tasks={tasks}
          birthdays={birthdays}
          calEvents={calEvents}
          today={TODAY}
          primary={primary}
          locale={locale}
          hebrewDates={hebrewDates}
          lang={lang}
          onDayNew={openNew}
          onToggleDayOff={toggleDayOff}
          onOpen={setDetail}
          onOpenLesson={setDetailLesson}
          onOpenTask={setDetailTask}
          onOpenSchedule={setDetailSchedule}
          onOpenEvent={setDetailEvent}
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
          hebrewDates={hebrewDates}
        />
      )}

      {detailLesson && (
        <LessonDetail
          l={detailLesson}
          onClose={() => setDetailLesson(null)}
          t={t}
          tCommon={tCommon}
          locale={locale}
          lang={lang}
        />
      )}

      {detailTask && (
        <TaskDetail
          task={detailTask}
          onClose={() => setDetailTask(null)}
          t={t}
          tCommon={tCommon}
          locale={locale}
          hebrewDates={hebrewDates}
        />
      )}

      {detailSchedule && (
        <ScheduleDetail
          s={detailSchedule}
          onClose={() => setDetailSchedule(null)}
          t={t}
          tCommon={tCommon}
          locale={locale}
          lang={lang}
        />
      )}

      {detailEvent && (
        <CalEventDetail
          ev={detailEvent}
          onClose={() => setDetailEvent(null)}
          onDeleted={async () => { setDetailEvent(null); await load() }}
        />
      )}

      {dayOpen && (
        <DayDetail
          dateISO={dayOpen}
          appointments={appointments}
          lessons={lessons}
          schedule={scheduleInstances}
          tasks={tasks}
          birthdays={birthdays}
          calEvents={calEvents}
          blocks={blocks}
          locale={locale}
          isRTL={isRTL}
          hebrewDates={hebrewDates}
          primary={primary}
          light={light}
          lang={lang}
          onClose={() => setDayOpen(null)}
          onNew={() => { const d = dayOpen; setDayOpen(null); openNew(d) }}
          onOpen={setDetail}
          onOpenLesson={setDetailLesson}
          onOpenTask={setDetailTask}
          onOpenSchedule={setDetailSchedule}
          onOpenEvent={setDetailEvent}
          t={t}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Детали личного события календаря
// ─────────────────────────────────────────────
function CalEventDetail({ ev, onClose, onDeleted }: { ev: CalEvent; onClose: () => void; onDeleted: () => void }) {
  const tAdd = useTranslations('add_to_calendar')
  const { lang } = useLang()
  const [deleting, setDeleting] = useState(false)

  async function remove() {
    setDeleting(true)
    try {
      await fetch(`/api/calendar/events/${ev.id}`, { method: 'DELETE' })
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div onClick={() => !deleting && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, padding: 20, width: 'min(420px,100%)', boxShadow: '0 10px 40px rgba(0,0,0,0.25)', display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>📅 {ev.title}</div>
        <div style={{ fontSize: 13, color: 'var(--text)' }}>
          {formatDate(ev.event_date, lang)}{!ev.all_day && ev.event_time ? ` · ${ev.event_time.slice(0, 5)}` : ''}
        </div>
        {ev.reminder_at && <div style={{ fontSize: 12, color: '#6366F1', fontWeight: 600 }}>🔔 {tAdd('has_reminder')}</div>}
        {ev.notes && <div style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{ev.notes}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 4 }}>
          <button onClick={remove} disabled={deleting} style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>
            {deleting ? tAdd('deleting') : tAdd('delete')}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {ev.link && <a href={ev.link} style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-strong)', textDecoration: 'none', padding: '8px 14px' }}>{tAdd('open_link')}</a>}
            <button onClick={onClose} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>{tAdd('cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Детали одного дня — вся лента событий выбранной даты
// ─────────────────────────────────────────────
function DayDetail({
  dateISO, appointments, lessons, schedule, tasks, birthdays, calEvents, blocks,
  locale, isRTL, hebrewDates, primary, light, lang,
  onClose, onNew, onOpen, onOpenLesson, onOpenTask, onOpenSchedule, onOpenEvent, t,
}: {
  dateISO: string
  appointments: Appointment[]
  lessons: Lesson[]
  schedule: ScheduleInstance[]
  tasks: Task[]
  birthdays: BirthdayInstance[]
  calEvents: CalEvent[]
  blocks: Block[]
  locale: string
  isRTL: boolean
  hebrewDates: boolean
  primary: string
  light: string
  lang: string
  onClose: () => void
  onNew: () => void
  onOpen: (a: Appointment) => void
  onOpenLesson: (l: Lesson) => void
  onOpenTask: (task: Task) => void
  onOpenSchedule: (s: ScheduleInstance) => void
  onOpenEvent: (e: CalEvent) => void
  t: (k: string, f?: string) => string
}) {
  // ПЕРЕИСПОЛЬЗУЕМ уже загруженные данные — никаких новых запросов. Тот же
  // mergeDayEvents, что и в сетке, но только для одной даты dateISO.
  const events = mergeDayEvents(appointments, lessons, schedule, tasks, birthdays, dateISO, calEvents)
  const blocked = isBlocked(blocks, dateISO)
  const label = new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${dateISO}T00:00:00Z`))

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 65, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} dir={isRTL ? 'rtl' : 'ltr'} style={{ background: 'var(--surface)', borderRadius: 12, padding: 20, width: 'min(460px,100%)', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.25)', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>{label}</div>
            {hebrewDates && (
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-faint)', marginTop: 2 }}>{formatHebrewDate(dateISO)}</div>
            )}
            {blocked && (
              <div style={{ fontSize: 11, fontWeight: 600, color: '#B45309', marginTop: 4 }}>{t('day_off')}</div>
            )}
          </div>
          <button onClick={onClose} aria-label={t('prev')} style={{ fontSize: 18, lineHeight: 1, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>×</button>
        </div>

        {events.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('empty_day')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {events.map(ev => {
              if (ev.kind === 'lesson' && ev.lesson) {
                const l = ev.lesson
                return (
                  <button key={`l-${l.id}`} onClick={() => onOpenLesson(l)} style={dayRowBtn(isRTL, LESSON_BG, LESSON_FG, LESSON_ACCENT)}>
                    <span style={dayRowTime}>{ev.time || t('all_day')}</span>
                    <span style={dayRowTitle}>{subjectLabel(l, lang)} · {l.class_group_name}</span>
                    <span style={dayRowKind}>{t('lesson')}</span>
                  </button>
                )
              }
              if (ev.kind === 'schedule' && ev.schedule) {
                const s = ev.schedule
                return (
                  <button key={`s-${s.slot_id}-${s.dateISO}`} onClick={() => onOpenSchedule(s)} style={dayRowBtn(isRTL, SCHEDULE_BG, SCHEDULE_FG, SCHEDULE_ACCENT)}>
                    <span style={dayRowTime}>{ev.time || t('all_day')}</span>
                    <span style={dayRowTitle}>{scheduleSubjectLabel(s, lang)} · {s.class_group_name}</span>
                    <span style={dayRowKind}>{t('planned_lesson')}</span>
                  </button>
                )
              }
              if (ev.kind === 'task' && ev.task) {
                const tk = ev.task
                return (
                  <button key={`t-${tk.id}`} onClick={() => onOpenTask(tk)} style={dayRowBtn(isRTL, TASK_BG, TASK_FG, TASK_ACCENT)}>
                    <span style={dayRowTime}>{ev.time || t('all_day')}</span>
                    <span style={dayRowTitle}>{tk.title}</span>
                    <span style={dayRowKind}>{t('task')}</span>
                  </button>
                )
              }
              if (ev.kind === 'event' && ev.event) {
                const ce = ev.event as CalEvent
                return (
                  <button key={`e-${ce.id}`} onClick={() => onOpenEvent(ce)} style={dayRowBtn(isRTL, 'var(--accent-tint)', '#4338CA', '#6366F1')}>
                    <span style={dayRowTime}>{ev.time || t('all_day')}</span>
                    <span style={dayRowTitle}>📅 {ce.title}</span>
                    <span style={dayRowKind}>{t('event')}</span>
                  </button>
                )
              }
              if (ev.kind === 'birthday' && ev.birthday) {
                const b = ev.birthday
                return (
                  <div key={`b-${b.dateISO}`} style={{ ...dayRowBtn(isRTL, BIRTHDAY_BG, BIRTHDAY_FG, BIRTHDAY_ACCENT), cursor: 'default' }}>
                    <span style={dayRowTime}>{t('all_day')}</span>
                    <span style={dayRowTitle}>🎂 {t('birthday')} · {b.age}</span>
                    <span style={dayRowKind}>{t('birthday')}</span>
                  </div>
                )
              }
              const a = ev.appointment!
              const st = statusStyle(a.status, primary, light)
              return (
                <button key={`a-${a.id}`} onClick={() => onOpen(a)} style={{ ...dayRowBtn(isRTL, st.bg, st.color, st.color), textDecoration: st.strike ? 'line-through' : 'none' }}>
                  <span style={dayRowTime}>{isoTime(a.starts_at)}</span>
                  <span style={dayRowTitle}>{a.title}</span>
                  <span style={dayRowKind}>{t(`status.${a.status}`)}</span>
                </button>
              )
            })}
          </div>
        )}

        <button onClick={onNew} style={{ fontSize: 13, fontWeight: 600, color: primary, background: light, border: `1px solid ${primary}`, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', justifySelf: isRTL ? 'end' : 'start' }}>
          + {t('new_appointment')}
        </button>
      </div>
    </div>
  )
}

const dayRowTime: React.CSSProperties = { fontSize: 12, fontWeight: 700, minWidth: 62 }
const dayRowTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
const dayRowKind: React.CSSProperties = { fontSize: 10, fontWeight: 600, opacity: 0.75, textTransform: 'uppercase', letterSpacing: 0.3 }
function dayRowBtn(isRTL: boolean, bg: string, color: string, accent: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 10, textAlign: isRTL ? 'right' : 'left', cursor: 'pointer',
    background: bg, color, borderInlineStart: `3px solid ${accent}`, border: 'none',
    borderRadius: 8, padding: '8px 12px', width: '100%',
  }
}

// ─────────────────────────────────────────────
// Статус-стили чипа
// ─────────────────────────────────────────────

function statusStyle(status: Status, primary: string, light: string): { bg: string; color: string; strike: boolean } {
  switch (status) {
    case 'completed': return { bg: '#D1FAE5', color: '#047857', strike: false }
    case 'cancelled': return { bg: 'var(--surface-2)', color: 'var(--text-faint)', strike: true }
    case 'no_show':   return { bg: '#FEF3C7', color: '#B45309', strike: false }
    default:          return { bg: light, color: primary, strike: false }
  }
}

// ─────────────────────────────────────────────
// Месячная сетка
// ─────────────────────────────────────────────

function MonthView({
  weeks, weekdayLabels, appointments, blocks, lessons, schedule, tasks, birthdays, calEvents, today, primary, light, isRTL, hebrewDates,
  onDayNew, onToggleDayOff, onOpen, onOpenLesson, onOpenTask, onOpenSchedule, onOpenEvent, onOpenDay, t,
}: {
  weeks: { dateISO: string; inMonth: boolean }[][]
  weekdayLabels: string[]
  appointments: Appointment[]
  blocks: Block[]
  lessons: Lesson[]
  schedule: ScheduleInstance[]
  tasks: Task[]
  birthdays: BirthdayInstance[]
  calEvents: CalEvent[]
  today: string
  primary: string
  light: string
  isRTL: boolean
  hebrewDates: boolean
  onDayNew: (d: string) => void
  onToggleDayOff: (d: string) => void
  onOpen: (a: Appointment) => void
  onOpenLesson: (l: Lesson) => void
  onOpenTask: (task: Task) => void
  onOpenSchedule: (s: ScheduleInstance) => void
  onOpenEvent: (e: CalEvent) => void
  onOpenDay: (d: string) => void
  t: (k: string, f?: string) => string
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Weekday header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
        {weekdayLabels.map((w, i) => (
          <div key={i} style={{
            textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)',
            textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 4px',
          }}>{w}</div>
        ))}
      </div>

      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {week.map(cell => {
            const events = mergeDayEvents(appointments, lessons, schedule, tasks, birthdays, cell.dateISO, calEvents)
            const blocked = isBlocked(blocks, cell.dateISO)
            const isToday = cell.dateISO === today
            const dayNum = Number(cell.dateISO.slice(8, 10))
            return (
              <div
                key={cell.dateISO}
                onClick={() => onOpenDay(cell.dateISO)}
                style={{
                  minHeight: 104, borderInlineEnd: '1px solid var(--surface-2)', borderBottom: '1px solid var(--surface-2)',
                  padding: 6, position: 'relative', background: blocked ? '#FAFAF9' : 'var(--surface)',
                  opacity: cell.inMonth ? 1 : 0.45, cursor: 'pointer',
                  backgroundImage: blocked
                    ? 'repeating-linear-gradient(135deg, transparent, transparent 6px, rgba(107,114,128,0.06) 6px, rgba(107,114,128,0.06) 12px)'
                    : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span
                      style={{
                        fontSize: 12, fontWeight: isToday ? 700 : 500,
                        color: isToday ? 'var(--surface)' : 'var(--text)',
                        background: isToday ? primary : 'transparent',
                        borderRadius: 999, width: 22, height: 22,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >{dayNum}</span>
                    {hebrewDates && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)' }}>
                        {hebrewDayNumber(cell.dateISO)}
                      </span>
                    )}
                  </span>
                  <span style={{ display: 'inline-flex', gap: 2 }}>
                    {blocked && (
                      <span title={t('day_off')} style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: 0.3 }}>
                        {t('day_off_short')}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDayNew(cell.dateISO) }}
                      title={t('new_appointment')}
                      style={dayAddBtn}
                    >+</button>
                  </span>
                </div>

                <div style={{ marginTop: 4, display: 'grid', gap: 3 }}>
                  {events.slice(0, 3).map(ev => {
                    // Урок — read-only, education-зелёный чип с левой полосой.
                    if (ev.kind === 'lesson' && ev.lesson) {
                      const l = ev.lesson
                      return (
                        <button
                          key={`l-${l.id}`}
                          onClick={(e) => { e.stopPropagation(); onOpenLesson(l) }}
                          title={`${t('lesson')} · ${l.class_group_name}`}
                          style={{
                            textAlign: isRTL ? 'right' : 'left', border: 'none', cursor: 'pointer',
                            background: LESSON_BG, color: LESSON_FG, borderInlineStart: `3px solid ${LESSON_ACCENT}`,
                            borderRadius: 5, padding: '2px 6px',
                            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            textDecoration: l.is_cancelled ? 'line-through' : 'none',
                            opacity: l.is_cancelled ? 0.55 : 1,
                          }}
                        >
                          {ev.time && `${ev.time} `}{l.class_group_name}
                        </button>
                      )
                    }
                    // Повторяющийся слот — read-only, зелёный с ПУНКТИРНОЙ полосой.
                    if (ev.kind === 'schedule' && ev.schedule) {
                      const s = ev.schedule
                      return (
                        <button
                          key={`s-${s.slot_id}-${s.dateISO}`}
                          onClick={(e) => { e.stopPropagation(); onOpenSchedule(s) }}
                          title={`${t('planned_lesson')} · ${s.class_group_name}`}
                          style={{
                            textAlign: isRTL ? 'right' : 'left', border: 'none', cursor: 'pointer',
                            background: SCHEDULE_BG, color: SCHEDULE_FG,
                            borderInlineStart: `3px dashed ${SCHEDULE_ACCENT}`,
                            borderRadius: 5, padding: '2px 6px',
                            fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}
                        >
                          {ev.time && `${ev.time} `}{s.class_group_name}
                        </button>
                      )
                    }
                    // Задача — read-only, амбер-чип с левой полосой.
                    if (ev.kind === 'task' && ev.task) {
                      const tk = ev.task
                      return (
                        <button
                          key={`t-${tk.id}`}
                          onClick={(e) => { e.stopPropagation(); onOpenTask(tk) }}
                          title={`${t('task')} · ${tk.title}`}
                          style={{
                            textAlign: isRTL ? 'right' : 'left', border: 'none', cursor: 'pointer',
                            background: TASK_BG, color: TASK_FG, borderInlineStart: `3px solid ${TASK_ACCENT}`,
                            borderRadius: 5, padding: '2px 6px',
                            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}
                        >
                          {ev.time && `${ev.time} `}{tk.title}
                        </button>
                      )
                    }
                    // Личное событие календаря — индиго-чип, клик открывает детали.
                    if (ev.kind === 'event' && ev.event) {
                      const ce = ev.event as CalEvent
                      return (
                        <button
                          key={`e-${ce.id}`}
                          onClick={(e) => { e.stopPropagation(); onOpenEvent(ce) }}
                          title={ce.title}
                          style={{
                            textAlign: isRTL ? 'right' : 'left', border: 'none', cursor: 'pointer',
                            background: 'var(--accent-tint)', color: '#4338CA', borderInlineStart: '3px solid #6366F1',
                            borderRadius: 5, padding: '2px 6px',
                            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}
                        >
                          {ev.time && `${ev.time} `}📅 {ce.title}
                        </button>
                      )
                    }
                    // День рождения — read-only, праздничный розовый чип с тортом.
                    // Нередактируемый: обычный span, без onClick.
                    if (ev.kind === 'birthday' && ev.birthday) {
                      const b = ev.birthday
                      return (
                        <span
                          key={`b-${b.dateISO}`}
                          title={`${t('birthday')} · ${b.age}`}
                          style={{
                            display: 'block', textAlign: isRTL ? 'right' : 'left',
                            background: BIRTHDAY_BG, color: BIRTHDAY_FG, borderInlineStart: `3px solid ${BIRTHDAY_ACCENT}`,
                            borderRadius: 5, padding: '2px 6px',
                            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}
                        >
                          🎂 {t('birthday')} · {b.age}
                        </span>
                      )
                    }
                    const a = ev.appointment!
                    const st = statusStyle(a.status, primary, light)
                    const isParticipant = a.role === 'participant'
                    return (
                      <button
                        key={`a-${a.id}`}
                        onClick={(e) => { e.stopPropagation(); onOpen(a) }}
                        title={isParticipant && a.provider_name ? `${t('booked_by')} ${a.provider_name}` : undefined}
                        style={{
                          textAlign: isRTL ? 'right' : 'left', cursor: 'pointer',
                          background: isParticipant ? 'transparent' : st.bg, color: st.color, borderRadius: 5, padding: '2px 6px',
                          fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          textDecoration: st.strike ? 'line-through' : 'none',
                          border: isParticipant ? `1px dashed ${st.color}` : 'none',
                        }}
                      >
                        {isoTime(a.starts_at)} {a.title}
                      </button>
                    )
                  })}
                  {events.length > 3 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenDay(cell.dateISO) }}
                      style={{
                        textAlign: isRTL ? 'right' : 'left', border: 'none', background: 'transparent', cursor: 'pointer',
                        fontSize: 10, color: 'var(--text-faint)', paddingInlineStart: 2,
                      }}
                    >
                      +{events.length - 3}
                    </button>
                  )}
                </div>

                {/* Быстрая пометка выходного при наведении — через двойной клик по дню */}
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleDayOff(cell.dateISO) }}
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
  days, appointments, blocks, lessons, schedule, tasks, birthdays, calEvents, today, primary, locale, hebrewDates, lang,
  onDayNew, onToggleDayOff, onOpen, onOpenLesson, onOpenTask, onOpenSchedule, onOpenEvent, t,
}: {
  days: string[]
  appointments: Appointment[]
  blocks: Block[]
  lessons: Lesson[]
  schedule: ScheduleInstance[]
  tasks: Task[]
  birthdays: BirthdayInstance[]
  calEvents: CalEvent[]
  today: string
  primary: string
  locale: string
  hebrewDates: boolean
  lang: string
  onDayNew: (d: string) => void
  onToggleDayOff: (d: string) => void
  onOpen: (a: Appointment) => void
  onOpenLesson: (l: Lesson) => void
  onOpenTask: (task: Task) => void
  onOpenSchedule: (s: ScheduleInstance) => void
  onOpenEvent: (e: CalEvent) => void
  t: (k: string, f?: string) => string
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {days.map(day => {
        const events = mergeDayEvents(appointments, lessons, schedule, tasks, birthdays, day, calEvents)
        const blocked = isBlocked(blocks, day)
        const isToday = day === today
        const label = new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'short', timeZone: 'UTC' })
          .format(new Date(`${day}T00:00:00Z`))
        return (
          <div key={day} style={{
            background: 'var(--surface)', border: `1px solid ${isToday ? primary : 'var(--border)'}`, borderRadius: 12, padding: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: isToday ? primary : 'var(--text)', textTransform: 'capitalize' }}>
                  {label}
                </span>
                {hebrewDates && (
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-faint)' }}>{formatHebrewDate(day)}</span>
                )}
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
            {events.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('empty_day')}</div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {events.map(ev => {
                  // Урок — read-only строка, education-зелёная, с меткой «שיעור».
                  if (ev.kind === 'lesson' && ev.lesson) {
                    const l = ev.lesson
                    const subj = subjectLabel(l, lang)
                    return (
                      <button
                        key={`l-${l.id}`}
                        onClick={() => onOpenLesson(l)}
                        style={{
                          textAlign: 'start', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                          background: LESSON_BG, border: '1px solid #A7F3D0', borderInlineStart: `3px solid ${LESSON_ACCENT}`,
                          borderRadius: 8, padding: '8px 12px', opacity: l.is_cancelled ? 0.6 : 1,
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 700, color: LESSON_FG, minWidth: 92 }}>
                          {ev.time || '—'}
                        </span>
                        <span style={{
                          fontSize: 13, fontWeight: 600, color: LESSON_FG, flex: 1,
                          textDecoration: l.is_cancelled ? 'line-through' : 'none',
                        }}>
                          <span style={lessonTag}>{t('lesson')}</span>
                          {' '}{l.class_group_name}
                          {subj && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {subj}</span>}
                        </span>
                        {l.location && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{l.location}</span>}
                        {l.is_cancelled && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)' }}>{t('lesson_cancelled')}</span>
                        )}
                      </button>
                    )
                  }
                  // Повторяющийся слот — read-only строка, зелёная ПУНКТИРНАЯ.
                  if (ev.kind === 'schedule' && ev.schedule) {
                    const s = ev.schedule
                    const subj = scheduleSubjectLabel(s, lang)
                    return (
                      <button
                        key={`s-${s.slot_id}-${s.dateISO}`}
                        onClick={() => onOpenSchedule(s)}
                        style={{
                          textAlign: 'start', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                          background: SCHEDULE_BG, border: `1px dashed ${SCHEDULE_ACCENT}`, borderInlineStart: `3px dashed ${SCHEDULE_ACCENT}`,
                          borderRadius: 8, padding: '8px 12px',
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 700, color: SCHEDULE_FG, minWidth: 92 }}>
                          {ev.time || '—'}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: SCHEDULE_FG, flex: 1 }}>
                          <span style={scheduleTag}>{t('recurring')}</span>
                          {' '}{s.class_group_name}
                          {subj && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> · {subj}</span>}
                        </span>
                        {s.room && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{s.room}</span>}
                      </button>
                    )
                  }
                  // Задача — read-only строка, амбер.
                  if (ev.kind === 'task' && ev.task) {
                    const tk = ev.task
                    return (
                      <button
                        key={`t-${tk.id}`}
                        onClick={() => onOpenTask(tk)}
                        style={{
                          textAlign: 'start', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                          background: TASK_BG, border: '1px solid #FDE68A', borderInlineStart: `3px solid ${TASK_ACCENT}`,
                          borderRadius: 8, padding: '8px 12px',
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 700, color: TASK_FG, minWidth: 92 }}>
                          {ev.time || t('all_day')}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: TASK_FG, flex: 1 }}>
                          <span style={taskTag}>{t('task')}</span>
                          {' '}{tk.title}
                        </span>
                      </button>
                    )
                  }
                  // Личное событие календаря — индиго-строка, клик открывает детали.
                  if (ev.kind === 'event' && ev.event) {
                    const ce = ev.event as CalEvent
                    return (
                      <button
                        key={`e-${ce.id}`}
                        onClick={() => onOpenEvent(ce)}
                        style={{
                          textAlign: 'start', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                          background: 'var(--accent-tint)', border: '1px solid #C7D2FE', borderInlineStart: '3px solid #6366F1',
                          borderRadius: 8, padding: '8px 12px',
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#4338CA', minWidth: 92 }}>
                          {ev.time || t('all_day')}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#4338CA', flex: 1 }}>
                          📅 {ce.title}
                        </span>
                      </button>
                    )
                  }
                  // День рождения — read-only строка, праздничная розовая с тортом.
                  // Нередактируемая: обычный div, без onClick.
                  if (ev.kind === 'birthday' && ev.birthday) {
                    const b = ev.birthday
                    return (
                      <div
                        key={`b-${b.dateISO}`}
                        style={{
                          textAlign: 'start', display: 'flex', alignItems: 'center', gap: 12,
                          background: BIRTHDAY_BG, border: `1px solid ${BIRTHDAY_ACCENT}`, borderInlineStart: `3px solid ${BIRTHDAY_ACCENT}`,
                          borderRadius: 8, padding: '8px 12px',
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 700, color: BIRTHDAY_FG, minWidth: 92 }}>
                          {t('all_day')}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: BIRTHDAY_FG, flex: 1 }}>
                          <span style={birthdayTag}>🎂 {t('birthday')}</span>
                          {' · '}{b.age}
                        </span>
                      </div>
                    )
                  }
                  const a = ev.appointment!
                  const st = statusStyle(a.status, primary, '#DBEAFE')
                  const mins = minutesBetween(a.starts_at, a.ends_at)
                  const isParticipant = a.role === 'participant'
                  const who = isParticipant
                    ? (a.provider_name || a.provider_hebrew_name)
                    : (a.student_name || a.student_hebrew_name)
                  return (
                    <button
                      key={`a-${a.id}`}
                      onClick={() => onOpen(a)}
                      style={{
                        textAlign: 'start', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                        background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px',
                        border: isParticipant ? `1px dashed ${primary}` : '1px solid var(--surface-2)',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', minWidth: 92 }}>
                        {isoTime(a.starts_at)}–{isoTime(a.ends_at)}
                      </span>
                      <span style={{
                        fontSize: 13, fontWeight: 600, color: st.color, flex: 1,
                        textDecoration: st.strike ? 'line-through' : 'none',
                      }}>
                        {a.title}
                        {who && (
                          <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                            {' · '}{isParticipant ? `${t('booked_by')} ${who}` : who}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{mins} {t('minutes')}</span>
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
              style={{ ...input, textAlign: isRTL ? 'right' : 'left', cursor: 'pointer', color: studentLabel ? 'var(--text)' : 'var(--text-faint)' }}
            >
              {studentLabel || t('form_student_none')}
            </button>
            {journeyId && (
              <button
                type="button"
                onClick={() => { setJourneyId(null); setStudentLabel('') }}
                style={{ position: 'absolute', top: 8, insetInlineEnd: 10, fontSize: 12, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}
              >✕</button>
            )}
            {pickerOpen && (
              <div style={{
                position: 'absolute', top: '100%', insetInlineStart: 0, insetInlineEnd: 0, zIndex: 20,
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                maxHeight: 220, overflowY: 'auto',
              }}>
                <input
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  placeholder={t('form_student_search')}
                  style={{ ...input, borderRadius: 0, border: 'none', borderBottom: '1px solid var(--surface-2)' }}
                  autoFocus
                />
                {studentOpts.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '8px 12px' }}>{t('form_student_empty')}</div>
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
                      fontSize: 13, color: 'var(--text)', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
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
  a, onClose, onEdit, onStatus, onDelete, t, tCommon, locale, primary, hebrewDates,
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
  hebrewDates: boolean
}) {
  const st = statusStyle(a.status, primary, '#DBEAFE')
  const dayISO = a.starts_at.slice(0, 10)
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${dayISO}T00:00:00Z`))
  const mins = minutesBetween(a.starts_at, a.ends_at)
  const who = a.student_name || a.student_hebrew_name
  const isParticipant = a.role === 'participant'
  const providerWho = a.provider_name || a.provider_hebrew_name

  return (
    <Overlay onClose={onClose}>
      <div style={dialog} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ ...dialogTitle, marginBottom: 4, textDecoration: st.strike ? 'line-through' : 'none' }}>{a.title}</h2>
          <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' }}>
            {t(`status.${a.status}`)}
          </span>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 8, textTransform: 'capitalize' }}>{dateLabel}</div>
        {hebrewDates && (
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{formatHebrewDate(dayISO)}</div>
        )}
        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2 }}>
          {isoTime(a.starts_at)}–{isoTime(a.ends_at)} · {mins} {t('minutes')}
        </div>
        {/* Для participant студент — это сам пользователь; показываем, КТО назначил. */}
        {isParticipant
          ? <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6 }}><b>{t('booked_by')}:</b> {providerWho ?? '—'}</div>
          : who && <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6 }}><b>{t('form_student')}:</b> {who}</div>}
        {a.reason && <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6 }}><b>{t('form_reason')}:</b> {a.reason}</div>}

        {isParticipant ? (
          // READ-ONLY: назначено мне кем-то другим — без правки/удаления/статусов.
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, borderTop: '1px solid var(--surface-2)', paddingTop: 14 }}>
            <button onClick={onClose} style={btnGhost}>{tCommon('back')}</button>
          </div>
        ) : (
          <>
            {/* Status actions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
              <button onClick={() => onStatus('completed')} style={statusBtn('#047857', '#D1FAE5')}>{t('mark_completed')}</button>
              <button onClick={() => onStatus('cancelled')} style={statusBtn('var(--text-muted)', 'var(--surface-2)')}>{t('mark_cancelled')}</button>
              <button onClick={() => onStatus('no_show')} style={statusBtn('#B45309', '#FEF3C7')}>{t('mark_no_show')}</button>
              {a.status !== 'scheduled' && (
                <button onClick={() => onStatus('scheduled')} style={statusBtn(primary, '#DBEAFE')}>{t('mark_scheduled')}</button>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16, borderTop: '1px solid var(--surface-2)', paddingTop: 14 }}>
              <button onClick={onDelete} style={{ ...btnGhost, color: '#DC2626' }}>{tCommon('delete')}</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onClose} style={btnGhost}>{tCommon('back')}</button>
                <button onClick={onEdit} style={btnPrimary(primary)}>{tCommon('edit')}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </Overlay>
  )
}

// ─────────────────────────────────────────────
// Легенда: пометки типов событий (пометка выходного / встреча / урок)
// ─────────────────────────────────────────────

function Legend({ t, primary }: { t: (k: string, f?: string) => string; primary: string }) {
  const item = (swatch: React.ReactNode, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
      {swatch}<span>{label}</span>
    </span>
  )
  const box: React.CSSProperties = { width: 14, height: 14, borderRadius: 4, flexShrink: 0 }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-faint)' }}>{t('legend.title')}</span>
      {item(<span style={{ ...box, background: primary }} />, t('legend.appointment'))}
      {item(
        <span style={{ ...box, background: LESSON_BG, border: '1px solid #A7F3D0', borderInlineStart: `3px solid ${LESSON_ACCENT}` }} />,
        t('legend.lesson'),
      )}
      {item(
        <span style={{ ...box, background: SCHEDULE_BG, border: `1px dashed ${SCHEDULE_ACCENT}`, borderInlineStart: `3px dashed ${SCHEDULE_ACCENT}` }} />,
        t('legend.recurring'),
      )}
      {item(
        <span style={{ ...box, background: TASK_BG, border: '1px solid #FDE68A', borderInlineStart: `3px solid ${TASK_ACCENT}` }} />,
        t('legend.task'),
      )}
      {item(
        <span style={{ ...box, background: BIRTHDAY_BG, border: `1px solid ${BIRTHDAY_ACCENT}`, borderInlineStart: `3px solid ${BIRTHDAY_ACCENT}` }} />,
        t('legend.birthday'),
      )}
      {item(
        <span style={{
          ...box, background: '#FAFAF9', border: '1px solid var(--border)',
          backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(107,114,128,0.25) 3px, rgba(107,114,128,0.25) 6px)',
        }} />,
        t('legend.day_off'),
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Диалог просмотра урока — ТОЛЬКО чтение (урок ведётся в модуле Education)
// ─────────────────────────────────────────────

function LessonDetail({
  l, onClose, t, tCommon, locale, lang,
}: {
  l: Lesson
  onClose: () => void
  t: (k: string, f?: string) => string
  tCommon: (k: string, f?: string) => string
  locale: string
  lang: string
}) {
  const subj = subjectLabel(l, lang)
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${l.date}T00:00:00Z`))
  const time = toHHmm(l.time)

  return (
    <Overlay onClose={onClose}>
      <div style={dialog} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 11, fontWeight: 700, color: LESSON_ACCENT, letterSpacing: 0.3, marginBottom: 6 }}>
          {t('my_lessons')} · {t('lesson_readonly')}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ ...dialogTitle, marginBottom: 4, textDecoration: l.is_cancelled ? 'line-through' : 'none' }}>
            {l.class_group_name}
          </h2>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: LESSON_ACCENT, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' }}>
            {t('lesson')}
          </span>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 8, textTransform: 'capitalize' }}>{dateLabel}</div>
        {time && <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2 }}>{time}</div>}
        {subj && <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6 }}><b>{t('lesson_subject')}:</b> {subj}</div>}
        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6 }}><b>{t('lesson_class_group')}:</b> {l.class_group_name}</div>
        {l.location && <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6 }}><b>{t('lesson_location')}:</b> {l.location}</div>}
        {l.is_cancelled && (
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', background: 'var(--surface-2)', borderRadius: 999, padding: '3px 12px', marginTop: 12, display: 'inline-block' }}>
            {t('lesson_cancelled')}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, borderTop: '1px solid var(--surface-2)', paddingTop: 14 }}>
          <button onClick={onClose} style={btnGhost}>{tCommon('back')}</button>
        </div>
      </div>
    </Overlay>
  )
}

// ─────────────────────────────────────────────
// Диалог просмотра задачи — ТОЛЬКО чтение (задача ведётся в модуле Tasks)
// ─────────────────────────────────────────────

function TaskDetail({
  task, onClose, t, tCommon, locale, hebrewDates,
}: {
  task: Task
  onClose: () => void
  t: (k: string, f?: string) => string
  tCommon: (k: string, f?: string) => string
  locale: string
  hebrewDates: boolean
}) {
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${task.due_date}T00:00:00Z`))
  const time = task.due_all_day ? '' : toHHmm(task.due_time)
  // Известные статусы задачи переводим; иначе показываем сырое значение.
  const knownStatus = ['pending', 'in_progress', 'review'].includes(task.status)
  const statusLabel = knownStatus ? t(`task_status.${task.status}`) : task.status

  return (
    <Overlay onClose={onClose}>
      <div style={dialog} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 11, fontWeight: 700, color: TASK_ACCENT, letterSpacing: 0.3, marginBottom: 6 }}>
          {t('my_tasks')} · {t('task_readonly')}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ ...dialogTitle, marginBottom: 4 }}>{task.title}</h2>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: TASK_ACCENT, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' }}>
            {t('task')}
          </span>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 8, textTransform: 'capitalize' }}>{dateLabel}</div>
        {hebrewDates && (
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{formatHebrewDate(task.due_date)}</div>
        )}
        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2 }}>
          {time || t('all_day')}
        </div>
        <div style={{ marginTop: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: TASK_FG, background: TASK_BG, border: '1px solid #FDE68A', borderRadius: 999, padding: '3px 12px' }}>
            {statusLabel}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16, borderTop: '1px solid var(--surface-2)', paddingTop: 14 }}>
          <a
            href={`/dashboard/tasks/${task.id}`}
            style={{ ...btnPrimary(TASK_ACCENT), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            {t('task_open')}
          </a>
          <button onClick={onClose} style={btnGhost}>{tCommon('back')}</button>
        </div>
      </div>
    </Overlay>
  )
}

// ─────────────────────────────────────────────
// Диалог просмотра слота расписания — ТОЛЬКО чтение (ведётся в Education)
// ─────────────────────────────────────────────

function ScheduleDetail({
  s, onClose, t, tCommon, locale, lang,
}: {
  s: ScheduleInstance
  onClose: () => void
  t: (k: string, f?: string) => string
  tCommon: (k: string, f?: string) => string
  locale: string
  lang: string
}) {
  const subj = scheduleSubjectLabel(s, lang)
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${s.dateISO}T00:00:00Z`))
  const start = toHHmm(s.start_time)
  const end = toHHmm(s.end_time)

  return (
    <Overlay onClose={onClose}>
      <div style={dialog} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 11, fontWeight: 700, color: SCHEDULE_FG, letterSpacing: 0.3, marginBottom: 6 }}>
          {t('planned_lesson')} · {t('recurring')}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ ...dialogTitle, marginBottom: 4 }}>{s.class_group_name}</h2>
          <span style={{ fontSize: 11, fontWeight: 700, color: SCHEDULE_FG, background: SCHEDULE_BG, border: `1px dashed ${SCHEDULE_ACCENT}`, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' }}>
            {t('recurring')}
          </span>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 8, textTransform: 'capitalize' }}>{dateLabel}</div>
        {(start || end) && (
          <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2 }}>{start}{end && `–${end}`}</div>
        )}
        {subj && <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6 }}><b>{t('lesson_subject')}:</b> {subj}</div>}
        <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6 }}><b>{t('lesson_class_group')}:</b> {s.class_group_name}</div>
        {s.room && <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6 }}><b>{t('lesson_location')}:</b> {s.room}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, borderTop: '1px solid var(--surface-2)', paddingTop: 14 }}>
          <button onClick={onClose} style={btnGhost}>{tCommon('back')}</button>
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
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

// ─── Инлайн-стили ─────────────────────────────────────────────────────────────

const navBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
const dayAddBtn: React.CSSProperties = {
  fontSize: 14, lineHeight: 1, color: '#C4C9D0', background: 'transparent', border: 'none',
  cursor: 'pointer', padding: '0 2px', fontWeight: 700,
}
const smallLink: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
}
// Метка «שיעור» на строке урока в недельном виде.
const lessonTag: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#fff', background: LESSON_ACCENT,
  borderRadius: 4, padding: '1px 6px', marginInlineEnd: 2,
}
// Метка повторяющегося слота на строке недельного вида.
const scheduleTag: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: SCHEDULE_FG, background: 'var(--surface)',
  border: `1px dashed ${SCHEDULE_ACCENT}`, borderRadius: 4, padding: '1px 6px', marginInlineEnd: 2,
}
// Метка задачи на строке недельного вида.
const taskTag: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#fff', background: TASK_ACCENT,
  borderRadius: 4, padding: '1px 6px', marginInlineEnd: 2,
}
// Метка дня рождения на строке недельного вида.
const birthdayTag: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#fff', background: BIRTHDAY_ACCENT,
  borderRadius: 4, padding: '1px 6px', marginInlineEnd: 2,
}
const dialog: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460,
  maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
}
const dialogTitle: React.CSSProperties = { fontSize: 17, fontWeight: 600, color: 'var(--text)', margin: 0 }
const input: React.CSSProperties = {
  width: '100%', fontSize: 13, padding: '9px 12px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)',
}
const btnGhost: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
}
function btnPrimary(primary: string): React.CSSProperties {
  return { fontSize: 13, fontWeight: 600, color: '#fff', background: primary, border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }
}
function statusBtn(color: string, bg: string): React.CSSProperties {
  return { fontSize: 12, fontWeight: 600, color, background: bg, border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }
}
