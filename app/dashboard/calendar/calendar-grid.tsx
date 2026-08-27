'use client'

// Виды-сетки календаря (месяц/неделя). Вынесено из CalendarClient.tsx для
// разгрузки монолита; поведение не менялось. Оба компонента — чисто
// презентационные (всё приходит пропсами).
import { formatHebrewDate, hebrewDayNumber } from '@/lib/calendar/hebrew'
import { isBlocked, mergeDayEvents, minutesBetween } from '@/lib/calendar/calendar'
import type { ScheduleInstance } from '@/lib/calendar/schedule'
import type { BirthdayInstance } from '@/lib/calendar/birthday'
import type { Appointment, Block, Lesson, Task, CalEvent } from './calendar-types'
import {
  isoTime, subjectLabel, scheduleSubjectLabel, statusStyle, smallLink,
  lessonTag, scheduleTag, taskTag, birthdayTag,
  LESSON_BG, LESSON_FG, LESSON_ACCENT, SCHEDULE_BG, SCHEDULE_FG, SCHEDULE_ACCENT,
  TASK_BG, TASK_FG, TASK_ACCENT, BIRTHDAY_BG, BIRTHDAY_FG, BIRTHDAY_ACCENT,
} from './calendar-utils'

// ─────────────────────────────────────────────
// Месячная сетка
// ─────────────────────────────────────────────

export function MonthView({
  weeks, weekdayLabels, appointments, blocks, lessons, schedule, tasks, birthdays, calEvents, today, primary, light, isRTL, hebrewDates,
  onOpen, onOpenLesson, onOpenTask, onOpenSchedule, onOpenEvent, onOpenDay, t,
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
  onOpen: (a: Appointment) => void
  onOpenLesson: (l: Lesson) => void
  onOpenTask: (task: Task) => void
  onOpenSchedule: (s: ScheduleInstance) => void
  onOpenEvent: (e: CalEvent) => void
  onOpenDay: (d: string) => void
  t: (k: string, f?: string) => string
}) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
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
                role="button"
                tabIndex={0}
                aria-label={cell.dateISO}
                onClick={() => onOpenDay(cell.dateISO)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDay(cell.dateISO) } }}
                style={{
                  minHeight: 104, borderInlineEnd: '1px solid var(--surface-2)', borderBottom: '1px solid var(--surface-2)',
                  padding: 6, position: 'relative', background: blocked ? 'var(--surface-2)' : 'var(--surface)',
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
                  {blocked && (
                    <span title={t('day_off')} style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: 0.3 }}>
                      {t('day_off_short')}
                    </span>
                  )}
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
                            background: 'var(--accent-tint)', color: 'var(--violet)', borderInlineStart: '3px solid #6366F1',
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

export function WeekView({
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
            background: 'var(--surface)', border: `1px solid ${isToday ? primary : 'var(--border)'}`, borderRadius: 14, padding: 14,
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
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warn)', background: 'var(--warn-tint)', borderRadius: 999, padding: '1px 8px' }}>
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
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--violet)', minWidth: 92 }}>
                          {ev.time || t('all_day')}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--violet)', flex: 1 }}>
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
                  const st = statusStyle(a.status, primary, 'var(--info-tint)')
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
