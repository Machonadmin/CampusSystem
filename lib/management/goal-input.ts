import { cleanText, isGoalStatus, isIsoDateStr, isProgress } from './validation'

/**
 * Разбор полей מטרה из тела запроса. partial=true — только переданные ключи
 * (PATCH); иначе title обязателен (POST). Возвращает { error } с кодом ошибки
 * API или { fields } для вставки/обновления.
 */
export function parseGoalInput(
  body: Record<string, unknown>,
  partial: boolean,
): { error: string } | { fields: Record<string, unknown> } {
  const f: Record<string, unknown> = {}
  if (!partial || 'title' in body) {
    const t = cleanText(body.title, 300)
    if (!t) return { error: 'title_field_required' }
    f.title = t
  }
  if ('description' in body) f.description = cleanText(body.description, 20000)
  for (const k of ['owner_id', 'meeting_id'] as const) {
    if (k in body) {
      const v = body[k]
      if (v !== null && v !== '' && typeof v !== 'string') return { error: 'invalid_reference' }
      f[k] = v === '' ? null : v
    }
  }
  for (const k of ['start_date', 'target_date'] as const) {
    if (k in body) {
      const v = body[k]
      if (v === null || v === '') f[k] = null
      else if (isIsoDateStr(v)) f[k] = v
      else return { error: 'date_required' }
    }
  }
  if (typeof f.start_date === 'string' && typeof f.target_date === 'string' && f.target_date < f.start_date) {
    return { error: 'goal_dates_order' }
  }
  if ('status' in body) {
    if (!isGoalStatus(body.status)) return { error: 'goal_status_invalid' }
    f.status = body.status
  }
  if ('progress' in body) {
    if (!isProgress(body.progress)) return { error: 'goal_progress_invalid' }
    f.progress = body.progress
  }
  return { fields: f }
}
