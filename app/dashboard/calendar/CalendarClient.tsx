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
} from '@/lib/calendar/calendar'
import {
  expandScheduleSlots,
  suppressCoveredInstances,
  type ScheduleSlot,
  type ScheduleInstance,
} from '@/lib/calendar/schedule'
import { birthdayInstances, type BirthdayInstance } from '@/lib/calendar/birthday'
import { formatHebrewDate, hebrewDayNumber } from '@/lib/calendar/hebrew'
import { intlLocale, formatDate } from '@/lib/i18n/format-date'
import AddToCalendar from '@/components/calendar/AddToCalendar'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { toastError, toastSuccess } from '@/components/ui/toast'
import AttendancePanel from '@/app/dashboard/education/components/AttendancePanel'
import type { LessonItem } from '@/app/dashboard/education/components/LessonsJournalTab'
import type {
  Appointment, Block, Lesson, Task, CalEvent, StudentOption, View, Status,
} from './calendar-types'
import {
  pad2, todayISO, isoTime, addDaysISO, startOfWeekISO, subjectLabel, scheduleSubjectLabel,
  LESSON_BG, LESSON_FG, LESSON_ACCENT, SCHEDULE_BG, SCHEDULE_FG, SCHEDULE_ACCENT,
  TASK_BG, TASK_ACCENT, TASK_FG, BIRTHDAY_BG, BIRTHDAY_FG, BIRTHDAY_ACCENT,
} from './calendar-utils'
import { Legend, LessonDetail, TaskDetail, ScheduleDetail } from './calendar-details'
import { CalEventDetail, DayDetail, AppointmentForm, AppointmentDetail } from './calendar-dialogs'
import { MonthView, WeekView } from './calendar-grid'
import {
  dayRowTime, dayRowTitle, dayRowKind, dayRowBtn, statusStyle, navBtn, addMenuItem, smallLink, lessonTag, scheduleTag, taskTag, birthdayTag, dialog, dialogTitle, input, btnGhost, btnPrimary, statusBtn,
} from './calendar-utils'

export default function CalendarClient() {
  const { lang, isRTL } = useLang()
  const t = useTranslations('calendar')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')
  const locale = intlLocale(lang)

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
  const [attendanceLesson, setAttendanceLesson] = useState<Lesson | null>(null) // отметка посещаемости из календаря
  const [canMarkAttendance, setCanMarkAttendance] = useState(false)
  const [detailTask, setDetailTask] = useState<Task | null>(null)  // read-only задача
  const [detailSchedule, setDetailSchedule] = useState<ScheduleInstance | null>(null) // слот
  const [dayOpen, setDayOpen] = useState<string | null>(null) // открытый день (детали дня)
  const [addMenuOpen, setAddMenuOpen] = useState(false)       // меню «добавить»: тип записи
  const [personalSignal, setPersonalSignal] = useState(0)     // триггер личного события

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

  // Может ли пользователь отмечать посещаемость — чтобы на уроке показать «נוכחות».
  // Грузим один раз; сбой = кнопки нет (сервер всё равно финальный гейт).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/education/attendance-capability')
        if (!res.ok) return
        const b = await res.json()
        if (!cancelled) setCanMarkAttendance(!!b.can_mark)
      } catch { /* без права — просто нет кнопки */ }
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
      if (res.status === 409) { toastError(t('overlap_error')); return }
      if (!res.ok) { const b = await res.json().catch(() => ({})); toastError(b.error ?? tCommon('action_failed')); return }
      setDetail(null)
      await load()
    } catch { toastError(tCommon('action_failed')) }
  }

  async function respondAttendance(a: Appointment, action: 'accept' | 'decline') {
    try {
      const res = await fetch(`/api/calendar/appointments/${a.id}/respond`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})); toastError(b.error ?? tCommon('action_failed')); return }
      toastSuccess(tCommon('saved'))
      setDetail(null)
      await load()
    } catch { toastError(tCommon('action_failed')) }
  }

  async function deleteAppointment(a: Appointment) {
    if (!(await confirmDialog({ message: t('confirm_delete'), tone: 'danger' }))) return
    try {
      const res = await fetch(`/api/calendar/appointments/${a.id}`, { method: 'DELETE' })
      if (!res.ok) { const b = await res.json().catch(() => ({})); toastError(b.error ?? tCommon('action_failed')); return }
      toastSuccess(tCommon('deleted'))
      setDetail(null)
      await load()
    } catch { toastError(tCommon('action_failed')) }
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
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setAddMenuOpen(v => !v)}
            aria-haspopup="menu"
            aria-expanded={addMenuOpen}
            style={{
              background: 'var(--surface)', color: primary, fontWeight: 600, fontSize: 13,
              border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            + {t('add_button')}
            <span style={{ fontSize: 10 }}>▾</span>
          </button>
          {addMenuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 45 }} onClick={() => setAddMenuOpen(false)} />
              <div
                role="menu"
                style={{
                  position: 'absolute', zIndex: 46, top: 'calc(100% + 4px)', insetInlineEnd: 0, minWidth: 220,
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                  boxShadow: '0 6px 20px rgba(0,0,0,0.12)', padding: 4, display: 'grid', gap: 1,
                }}
              >
                <button
                  role="menuitem"
                  onClick={() => { setAddMenuOpen(false); openNew(view === 'month' ? TODAY : anchor) }}
                  style={addMenuItem}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{t('new_appointment')}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t('add_appointment_hint')}</span>
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setAddMenuOpen(false); setPersonalSignal(s => s + 1) }}
                  style={addMenuItem}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{t('add_personal_event')}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t('add_personal_hint')}</span>
                </button>
              </div>
            </>
          )}
        </div>
        <AddToCalendar variant="button" hideTrigger openSignal={personalSignal} onAdded={load} />
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
              fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap',
              border: `1px solid ${hebrewDates ? primary : 'var(--border)'}`,
              background: hebrewDates ? light : 'var(--surface)',
              color: hebrewDates ? primary : 'var(--text-muted)',
            }}
          >
            {t('hebrew_dates')}
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
        <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonRows avatar={false} rows={6} />
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
          onRespond={(action) => respondAttendance(detail, action)}
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
          canMark={canMarkAttendance}
          onAttendance={(l) => { setDetailLesson(null); setAttendanceLesson(l) }}
        />
      )}

      {/* Отметка посещаемости прямо из календаря (по запросу владельца: «נוכחות
          מתוך היומן»). Панель сама грузит ростер по id урока; POST сервер гейтит
          по mark_attendance в контексте группы. */}
      {attendanceLesson && (
        <AttendancePanel
          lesson={{
            id: attendanceLesson.id,
            class_group_id: attendanceLesson.class_group_id,
            scheduled_date: attendanceLesson.date,
            scheduled_time: attendanceLesson.time,
            topic: null,
            description: null,
            location: attendanceLesson.location,
            is_cancelled: attendanceLesson.is_cancelled,
            marked_count: 0,
          } as LessonItem}
          canMarkAttendance
          accentColor={LESSON_ACCENT}
          onClose={() => setAttendanceLesson(null)}
          onSaved={() => { setAttendanceLesson(null); load() }}
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
          onToggleDayOff={toggleDayOff}
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
