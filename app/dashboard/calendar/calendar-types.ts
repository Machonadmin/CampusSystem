// Общие типы данных календаря, приходящие с API. Вынесены из CalendarClient,
// чтобы клиент и его под-компоненты (виды/детали) ссылались на единый источник
// (шаг разбиения гигантского CalendarClient — см. code review M3).

export interface Appointment {
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
  // Синхронизация: 'provider' — моя встреча (редактируемая), 'participant' —
  // назначена мне кем-то (READ-ONLY). У participant заполнен provider_name.
  role: 'provider' | 'participant'
  provider_name: string | null
  provider_hebrew_name: string | null
}

export interface Block {
  id: string
  block_date: string
  reason: string | null
}

// Урок преподавателя/студента — read-only на календаре (ведётся в Education).
export interface Lesson {
  id: string
  class_group_id: string       // нужен для подавления перекрытых слотов
  date: string                 // scheduled_date 'YYYY-MM-DD'
  time: string | null          // scheduled_time 'HH:mm:ss' или null
  class_group_name: string
  subject: string
  subject_he: string | null
  location: string | null
  is_cancelled: boolean
}

// Задача с дедлайном — read-only (ведётся в модуле Tasks).
export interface Task {
  id: string
  title: string
  due_date: string             // 'YYYY-MM-DD'
  due_time: string | null      // 'HH:mm:ss' или null
  due_all_day: boolean
  status: string
}

export interface CalEvent {
  id: string
  title: string
  notes: string | null
  event_date: string
  event_time: string | null
  all_day: boolean
  reminder_at: string | null
  link: string | null
}

export interface StudentOption {
  journey_id: string
  full_name: string
  hebrew_name: string | null
}

export type View = 'month' | 'week'
export type Status = Appointment['status']
