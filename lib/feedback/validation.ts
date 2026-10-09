// ─── «הצעה לשיפור או באג»: чистые правила ────────────────────────────────────
//
// Без сети и Next — чтобы покрыть тестами. Маршруты (app/api/feedback,
// app/api/agent/feedback) берут ограничения отсюда, форма в шапке — тоже.

export const FEEDBACK_KINDS = ['bug', 'suggestion'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

export const FEEDBACK_STATUSES = ['new', 'in_review', 'in_progress', 'done', 'rejected'] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

export const MAX_BODY_CHARS = 5000
export const MAX_REPLY_CHARS = 2000
export const MAX_SCREENSHOTS = 5
/** Один скриншот — до 5 МБ (снимок экрана телефона обычно 1–3 МБ). */
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
export const SCREENSHOT_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export function isFeedbackKind(v: unknown): v is FeedbackKind {
  return typeof v === 'string' && (FEEDBACK_KINDS as readonly string[]).includes(v)
}

export function isFeedbackStatus(v: unknown): v is FeedbackStatus {
  return typeof v === 'string' && (FEEDBACK_STATUSES as readonly string[]).includes(v)
}

export function isScreenshotMime(v: unknown): boolean {
  return typeof v === 'string' && (SCREENSHOT_MIME_TYPES as readonly string[]).includes(v)
}

/** Текст замечания после trim; null — пусто или слишком длинно. */
export function normalizeBody(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (s.length === 0 || s.length > MAX_BODY_CHARS) return null
  return s
}

/**
 * Адрес страницы, с которой отправлено замечание. Храним только путь внутри
 * сайта (без домена и без чужих ссылок) — это подсказка «где», а не ссылка,
 * по которой кто-то будет переходить.
 */
export function normalizePagePath(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s.startsWith('/') || s.startsWith('//')) return null
  return s.slice(0, 500)
}

export interface ScreenshotCheck {
  size: number
  type: string
}

export type ScreenshotProblem = 'too_many' | 'too_large' | 'bad_type' | null

/** Проверка набора скриншотов до загрузки. */
export function checkScreenshots(files: readonly ScreenshotCheck[]): ScreenshotProblem {
  if (files.length > MAX_SCREENSHOTS) return 'too_many'
  for (const f of files) {
    if (!isScreenshotMime(f.type)) return 'bad_type'
    if (f.size <= 0 || f.size > MAX_SCREENSHOT_BYTES) return 'too_large'
  }
  return null
}

export interface StatusPatch {
  status?: FeedbackStatus
  owner_reply?: string | null
}

/**
 * Разбор изменения статуса/ответа (экран владельца и /api/agent/feedback).
 * null — запрос некорректен или ничего не меняет.
 */
export function parseStatusPatch(body: unknown): StatusPatch | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const out: StatusPatch = {}
  if (b.status !== undefined) {
    if (!isFeedbackStatus(b.status)) return null
    out.status = b.status
  }
  if (b.owner_reply !== undefined) {
    if (b.owner_reply === null) out.owner_reply = null
    else if (typeof b.owner_reply === 'string') {
      const r = b.owner_reply.trim()
      if (r.length > MAX_REPLY_CHARS) return null
      out.owner_reply = r.length > 0 ? r : null
    } else return null
  }
  if (out.status === undefined && out.owner_reply === undefined) return null
  return out
}
