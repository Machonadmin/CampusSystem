// Чистые (без React/состояния) хелперы и палитры календаря. Вынесено из
// CalendarClient.tsx, чтобы разгрузить монолит; поведение не менялось.
import { getModuleColor } from '@/lib/module-colors'
import type { ScheduleInstance } from '@/lib/calendar/schedule'
import type { Lesson } from './calendar-types'

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
