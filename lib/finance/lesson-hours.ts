/**
 * Длительность урока в часах из времени начала/конца ('HH:MM[:SS]'). Пересечение
 * полуночи не ожидается; при отсутствии/некорректности — null. Чистая функция.
 */
export function lessonHours(startTime: string | null, endTime: string | null): number | null {
  if (!startTime || !endTime) return null
  const mins = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    return h * 60 + m
  }
  const s = mins(startTime), e = mins(endTime)
  if (s === null || e === null || e <= s) return null
  return Math.round(((e - s) / 60) * 100) / 100
}
