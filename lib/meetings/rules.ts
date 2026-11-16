// ─── פגישות המנהל: чистые правила (без БД) ──────────────────────────────────
//
// Здесь — то, что легко сломать незаметно и поэтому покрыто тестами:
//   • кто что видит во встрече (приватность — требование владельца:
//     «כברירת מחדל המזכירה רואה רק מועד, משתתפים ונושא, לא את התוכן»);
//   • свободные окна в дне календаря;
//   • переходы статусов заявки на встречу;
//   • проверка ввода.

/** Отношение человека к встрече. Одна встреча — один владелец (provider_id). */
export interface MeetingRelation {
  /** Владелец календаря (provider_id). */
  isOwner: boolean
  /** Ведёт календарь владельца (calendar_delegates) — מזכירת המנהל. */
  isDelegate: boolean
  /** Владелец открыл ему содержание этой встречи (appointment_content_viewers). */
  isContentViewer: boolean
}

export interface MeetingVisibility {
  /** Видит встречу вообще (время, участники, тема). */
  basic: boolean
  /** Содержание: פירוט, הערות, סיכום, החלטות ומשימות. */
  content: boolean
  /** Подготовка: חומר הכנה и документы — работа секретаря. */
  prep: boolean
  /** הערה חסויה — ТОЛЬКО владелец, без исключений. */
  privateNote: boolean
  /** Может назначать / переносить / отменять (время, тема, участники). */
  manageSchedule: boolean
  /** Может писать содержание, решения, задачи, выбирать кто что видит, передавать. */
  manageContent: boolean
}

export function meetingVisibility(r: MeetingRelation): MeetingVisibility {
  if (r.isOwner) {
    return { basic: true, content: true, prep: true, privateNote: true, manageSchedule: true, manageContent: true }
  }
  return {
    basic: r.isDelegate || r.isContentViewer,
    content: r.isContentViewer,
    prep: r.isDelegate,
    privateNote: false,
    manageSchedule: r.isDelegate,
    manageContent: false,
  }
}

/** Полная строка встречи, как её читает API. */
export interface MeetingRow {
  id: string
  provider_id: string
  journey_id: string | null
  title: string
  reason: string | null
  notes: string | null
  summary: string | null
  private_note: string | null
  prep_notes: string | null
  starts_at: string
  ends_at: string
  status: string
}

/**
 * Убирает из встречи всё, что человеку не положено. Поля не удаляются, а
 * обнуляются — форма ответа одинакова для всех, клиент не гадает.
 */
export function redactMeeting<T extends MeetingRow>(row: T, v: MeetingVisibility): T {
  return {
    ...row,
    reason: v.content ? row.reason : null,
    notes: v.content ? row.notes : null,
    summary: v.content ? row.summary : null,
    prep_notes: v.prep ? row.prep_notes : null,
    private_note: v.privateNote ? row.private_note : null,
  }
}

// ─── Свободные окна ─────────────────────────────────────────────────────────

/** Интервал в минутах суток [start, end). */
export type MinuteRange = [number, number]

export const WORKDAY_START_MIN = 8 * 60
export const WORKDAY_END_MIN = 20 * 60

/**
 * Свободные окна дня между занятыми интервалами. Занятые интервалы могут
 * пересекаться и идти в любом порядке. Окна короче minLength не возвращаются.
 */
export function freeSlots(
  busy: MinuteRange[],
  dayStart = WORKDAY_START_MIN,
  dayEnd = WORKDAY_END_MIN,
  minLength = 15,
): MinuteRange[] {
  const sorted = busy
    .map(([s, e]) => [Math.max(s, dayStart), Math.min(e, dayEnd)] as MinuteRange)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])
  const out: MinuteRange[] = []
  let cursor = dayStart
  for (const [s, e] of sorted) {
    if (s > cursor && s - cursor >= minLength) out.push([cursor, s])
    if (e > cursor) cursor = e
  }
  if (dayEnd > cursor && dayEnd - cursor >= minLength) out.push([cursor, dayEnd])
  return out
}

/** 'YYYY-MM-DDTHH:mm…' → минуты суток по локальной части строки (без TZ). */
export function isoToMinutes(iso: string): number | null {
  const m = iso.match(/T(\d{1,2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export function minutesToHHmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

// ─── Заявки на встречу ──────────────────────────────────────────────────────

export const REQUEST_STATUSES = ['pending', 'approved', 'declined', 'proposed', 'cancelled'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

/** Действия того, кто ведёт календарь (владелец или секретарь). */
export type HandlerAction = 'approve' | 'decline' | 'propose'
/** Действия того, кто просил встречу. */
export type RequesterAction = 'accept_proposal' | 'decline_proposal' | 'cancel'

/**
 * Можно ли выполнить действие при текущем статусе заявки. Закрытые заявки
 * (approved / declined / cancelled) не меняются.
 */
export function canApplyRequestAction(status: string, action: HandlerAction | RequesterAction): boolean {
  switch (action) {
    case 'approve':
    case 'decline':
    case 'propose':
      return status === 'pending' || status === 'proposed'
    case 'accept_proposal':
    case 'decline_proposal':
      return status === 'proposed'
    case 'cancel':
      return status === 'pending' || status === 'proposed'
    default:
      return false
  }
}

/** Статус заявки после действия. */
export function statusAfter(action: HandlerAction | RequesterAction): RequestStatus {
  switch (action) {
    case 'approve': return 'approved'
    case 'accept_proposal': return 'approved'
    case 'decline': return 'declined'
    case 'propose': return 'proposed'
    case 'decline_proposal': return 'cancelled'
    case 'cancel': return 'cancelled'
  }
}

// ─── Проверка ввода ─────────────────────────────────────────────────────────

/** 'YYYY-MM-DDTHH:mm' (локальное время, как в остальном календаре). */
export function isLocalDateTime(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s) && !Number.isNaN(Date.parse(s))
}

/** Интервал корректен: оба значения — локальное время, конец позже начала. */
export function isValidRange(starts: unknown, ends: unknown): boolean {
  return isLocalDateTime(starts) && isLocalDateTime(ends) && Date.parse(ends) > Date.parse(starts)
}

/** Обрезает строку; пустая → null; длиннее max → undefined (ошибка ввода). */
export function cleanText(v: unknown, max: number): string | null | undefined {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  if (!s) return null
  if (s.length > max) return undefined
  return s
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}
