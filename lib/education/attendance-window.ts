// ─── Окно редактирования посещаемости ────────────────────────────────────────
//
// Правило (согласовано с владельцем): учитель отмечает/правит посещаемость
// во время урока и ещё 30 минут после; после этого — только его руководитель.
// Руководитель может дать конкретному учителю доп. время (extraMinutes).
//
// Времена урока — местные (израильские) настенные часы. Чтобы не зависеть от
// таймзоны сервера и корректно учитывать переход на летнее время, «сейчас»
// приводится к местному времени через Intl, а дедлайн строится из местных
// компонентов урока. Оба представлены как Date.UTC(местные-компоненты) — общий
// сдвиг таймзоны сокращается при сравнении.

const TZ = 'Asia/Jerusalem'

export interface AttendanceWindowInput {
  scheduledDate: string          // 'YYYY-MM-DD'
  scheduledTime: string | null   // 'HH:MM[:SS]' начало
  scheduledEndTime: string | null // 'HH:MM[:SS]' конец
  graceMinutes?: number          // по умолчанию 30
  extraMinutes?: number          // из teacher_attendance_grants
  defaultDurationMinutes?: number // если нет конца — длительность по умолчанию (120)
}

/** «Сейчас» в местном времени, как Date.UTC(местные компоненты) — в мс. */
export function nowLocalMs(now: Date, tz: string = TZ): number {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const p: Record<string, string> = {}
  for (const part of f.formatToParts(now)) p[part.type] = part.value
  const hour = p.hour === '24' ? 0 : Number(p.hour)
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, Number(p.minute))
}

/** Крайний момент (в «местных мс»), до которого учитель может править. */
export function attendanceDeadlineMs(i: AttendanceWindowInput): number {
  const [y, mo, d] = i.scheduledDate.split('-').map(Number)
  const grace = i.graceMinutes ?? 30
  const extra = i.extraMinutes ?? 0
  const dur = i.defaultDurationMinutes ?? 120

  let endMs: number
  if (i.scheduledEndTime) {
    const [h, mi] = i.scheduledEndTime.split(':').map(Number)
    endMs = Date.UTC(y, mo - 1, d, h, mi)
  } else if (i.scheduledTime) {
    const [h, mi] = i.scheduledTime.split(':').map(Number)
    endMs = Date.UTC(y, mo - 1, d, h, mi) + dur * 60_000
  } else {
    // Нет времени — считаем весь день урока (до 23:59) окном.
    endMs = Date.UTC(y, mo - 1, d, 23, 59)
  }
  return endMs + (grace + extra) * 60_000
}

/** true, если сейчас учитель ещё вправе править посещаемость этого урока. */
export function isWithinAttendanceWindow(now: Date, i: AttendanceWindowInput, tz: string = TZ): boolean {
  return nowLocalMs(now, tz) <= attendanceDeadlineMs(i)
}
