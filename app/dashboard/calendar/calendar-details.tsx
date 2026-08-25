'use client'

// Диалоги/легенда календаря (только чтение) + мелкие обёртки. Вынесено из
// CalendarClient.tsx для разгрузки монолита; поведение не менялось.
import { useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import { Modal } from '@/components/ui/Modal'
import { toHHmm } from '@/lib/calendar/calendar'
import { formatHebrewDate } from '@/lib/calendar/hebrew'
import type { ScheduleInstance } from '@/lib/calendar/schedule'
import type { Lesson, Task } from './calendar-types'
import {
  subjectLabel, scheduleSubjectLabel, dialog, dialogTitle, btnGhost, btnPrimary,
  LESSON_BG, LESSON_ACCENT, SCHEDULE_BG, SCHEDULE_FG, SCHEDULE_ACCENT,
  TASK_BG, TASK_ACCENT, TASK_FG, BIRTHDAY_BG, BIRTHDAY_ACCENT,
} from './calendar-utils'

// ─────────────────────────────────────────────
// Легенда: пометки типов событий (пометка выходного / встреча / урок)
// ─────────────────────────────────────────────

export function Legend({ t, primary }: { t: (k: string, f?: string) => string; primary: string }) {
  const [open, setOpen] = useState(false)
  const item = (swatch: ReactNode, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
      {swatch}<span>{label}</span>
    </span>
  )
  const box: CSSProperties = { width: 14, height: 14, borderRadius: 4, flexShrink: 0 }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        {t('legend.title')}
        <span style={{ fontSize: 10, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
      </button>
      {!open ? null : <>
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
      </>}
    </div>
  )
}

// ─────────────────────────────────────────────
// Диалог просмотра урока — ТОЛЬКО чтение (урок ведётся в модуле Education)
// ─────────────────────────────────────────────

export function LessonDetail({
  l, onClose, t, tCommon, locale, lang, canMark, onAttendance,
}: {
  l: Lesson
  onClose: () => void
  t: (k: string, f?: string) => string
  tCommon: (k: string, f?: string) => string
  locale: string
  lang: string
  canMark: boolean
  onAttendance: (l: Lesson) => void
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
          {canMark && !l.is_cancelled && (
            <button
              onClick={() => onAttendance(l)}
              style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', background: LESSON_ACCENT, color: '#fff' }}
            >
              {t('take_attendance', 'נוכחות')}
            </button>
          )}
        </div>
      </div>
    </Overlay>
  )
}

// ─────────────────────────────────────────────
// Диалог просмотра задачи — ТОЛЬКО чтение (задача ведётся в модуле Tasks)
// ─────────────────────────────────────────────

export function TaskDetail({
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

export function ScheduleDetail({
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

// Тонкая обёртка над общим <Modal>: сохраняет прежнее API Overlay (клик по фону
// закрывает) и «прозрачную» панель — детали календаря сами задают свою карточку.
export function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <Modal onClose={onClose} closeOnBackdrop maxWidth="none" panelStyle={{ background: 'transparent', boxShadow: 'none', borderRadius: 0, overflowY: 'visible', width: 'auto', maxHeight: 'none' }}>
      {children}
    </Modal>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}
