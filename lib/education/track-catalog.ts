/**
 * Валидация каталога учебных маршрутов (study_tracks, spec §3.2). Код маршрута —
 * стабильный slug (строчные латинские, цифры, подчёркивание), используется как
 * машинный идентификатор. Чистая функция — тестируется без БД и переиспользуется
 * клиентом (TrackModal) и сервером (zod-схема повторяет тот же паттерн).
 */
export const TRACK_CODE_RE = /^[a-z0-9_]+$/

export function isValidTrackCode(code: string): boolean {
  const c = code.trim()
  return c.length >= 2 && c.length <= 40 && TRACK_CODE_RE.test(c)
}
