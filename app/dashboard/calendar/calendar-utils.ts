// Чистые (без React/состояния) хелперы и палитры календаря. Вынесено из
// CalendarClient.tsx, чтобы разгрузить монолит; поведение не менялось.
import { getModuleColor } from '@/lib/module-colors'
import type { ScheduleInstance } from '@/lib/calendar/schedule'
import type { CSSProperties } from 'react'
import type { Lesson, Status } from './calendar-types'

// ─── Чистые date-хелперы клиента (UTC-арифметика, стабильна к DST) ───────────

export function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}` }

export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 'HH:mm' из ISO-таймстемпа — берём wall-clock из строки, стабильно к TZ. */
export function isoTime(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso)
  return m ? `${m[1]}:${m[2]}` : ''
}

export function addDaysISO(iso: string, n: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

/** Начало недели (воскресенье), содержащей dateISO. */
export function startOfWeekISO(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay() // 0=вс
  return addDaysISO(iso, -dow)
}

/** Название предмета урока: иврит, если язык he и name_he задан — как в Education. */
export function subjectLabel(l: Lesson, lang: string): string {
  if (lang === 'he' && l.subject_he) return l.subject_he
  return l.subject
}

// Название предмета слота расписания: иврит, если язык he и он задан.
export function scheduleSubjectLabel(s: ScheduleInstance, lang: string): string {
  if (lang === 'he' && s.subject_name_he) return s.subject_name_he
  return s.subject_name
}

// ─── Палитры видов календаря ─────────────────────────────────────────────────

// Палитра урока — education-зелёный. Намеренно светлее «завершённой» встречи
// (#D1FAE5) плюс сплошная левая полоса, чтобы урок не путался ни с одним
// статусом встречи.
export const LESSON_BG = 'var(--success-tint)'
export const LESSON_FG = 'var(--success)'
export const LESSON_ACCENT = '#10B981'

// Палитра повторяющегося слота расписания («плановое занятие») — тот же зелёный,
// но легче и ПУНКТИРНОЙ полосой, чтобы читалось как «шаблон/повтор», а не урок.
export const SCHEDULE_BG = '#F6FEFB'
export const SCHEDULE_FG = '#059669'
export const SCHEDULE_ACCENT = '#6EE7B7'

// Палитра задачи — амбер модуля Tasks (getModuleColor('tasks')).
export const TASK_BG = getModuleColor('tasks', 'light')      // #FEF3C7
export const TASK_ACCENT = getModuleColor('tasks', 'primary') // #F59E0B
export const TASK_FG = 'var(--warn)'

// Палитра дня рождения — праздничный розовый с эмодзи-тортом. Намеренно вне
// синей/зелёной/амбер гаммы остальных четырёх видов, чтобы читалось как «личный
// праздник», а не рабочее событие. День рождения read-only (нередактируемый чип).
export const BIRTHDAY_BG = 'var(--violet-tint)'
export const BIRTHDAY_FG = '#BE185D'
export const BIRTHDAY_ACCENT = '#EC4899'

// ─── Стили/хелперы вью, вынесенные из CalendarClient (чистые) ───

export const dayRowTime: CSSProperties = { fontSize: 12, fontWeight: 700, minWidth: 62 }
export const dayRowTitle: CSSProperties = { fontSize: 13, fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
export const dayRowKind: CSSProperties = { fontSize: 10, fontWeight: 600, opacity: 0.75, textTransform: 'uppercase', letterSpacing: 0.3 }
export function dayRowBtn(isRTL: boolean, bg: string, color: string, accent: string): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 10, textAlign: isRTL ? 'right' : 'left', cursor: 'pointer',
    background: bg, color, borderInlineStart: `3px solid ${accent}`, border: 'none',
    borderRadius: 8, padding: '8px 12px', width: '100%',
  }
}

// ─────────────────────────────────────────────
// Статус-стили чипа
// ─────────────────────────────────────────────

export function statusStyle(status: Status, primary: string, light: string): { bg: string; color: string; strike: boolean } {
  switch (status) {
    case 'completed': return { bg: 'var(--success-tint)', color: 'var(--success)', strike: false }
    case 'cancelled': return { bg: 'var(--surface-2)', color: 'var(--text-faint)', strike: true }
    case 'no_show':   return { bg: 'var(--warn-tint)', color: 'var(--warn)', strike: false }
    default:          return { bg: light, color: primary, strike: false }
  }
}

export const navBtn: CSSProperties = {
  width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
export const addMenuItem: CSSProperties = {
  display: 'grid', gap: 2, textAlign: 'start', background: 'none', border: 'none',
  borderRadius: 7, cursor: 'pointer', padding: '9px 12px', width: '100%',
}
export const smallLink: CSSProperties = {
  fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer',
}
// Метка «שיעור» на строке урока в недельном виде.
export const lessonTag: CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#fff', background: LESSON_ACCENT,
  borderRadius: 4, padding: '1px 6px', marginInlineEnd: 2,
}
// Метка повторяющегося слота на строке недельного вида.
export const scheduleTag: CSSProperties = {
  fontSize: 10, fontWeight: 700, color: SCHEDULE_FG, background: 'var(--surface)',
  border: `1px dashed ${SCHEDULE_ACCENT}`, borderRadius: 4, padding: '1px 6px', marginInlineEnd: 2,
}
// Метка задачи на строке недельного вида.
export const taskTag: CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#fff', background: TASK_ACCENT,
  borderRadius: 4, padding: '1px 6px', marginInlineEnd: 2,
}
// Метка дня рождения на строке недельного вида.
export const birthdayTag: CSSProperties = {
  fontSize: 10, fontWeight: 700, color: '#fff', background: BIRTHDAY_ACCENT,
  borderRadius: 4, padding: '1px 6px', marginInlineEnd: 2,
}
export const dialog: CSSProperties = {
  background: 'var(--surface)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460,
  maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
}
export const dialogTitle: CSSProperties = { fontSize: 17, fontWeight: 600, color: 'var(--text)', margin: 0 }
export const input: CSSProperties = {
  width: '100%', fontSize: 13, padding: '9px 12px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)',
}
export const btnGhost: CSSProperties = {
  fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
}
export function btnPrimary(primary: string): CSSProperties {
  return { fontSize: 13, fontWeight: 600, color: '#fff', background: primary, border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }
}
export function statusBtn(color: string, bg: string): CSSProperties {
  return { fontSize: 12, fontWeight: 600, color, background: bg, border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer' }
}
