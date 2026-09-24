// ─── Календарь: день рождения владельца календаря (read-only, повтор раз в год) ─
//
// Чистая логика (без БД и без Date.now): дата рождения (persons.birth_date,
// 'YYYY-MM-DD') разворачивается в конкретные экземпляры «дня рождения» для
// диапазона дат — по одному на каждый год, чей (месяц, день) совпадает с
// датой рождения и попадает в [fromISO, toISO] (обе границы ВКЛЮЧИТЕЛЬНО).
// Даты считаем через UTC-хелперы schedule-dates (DST-безопасно).

import { parseDateUTC, fmtDateUTC } from '@/lib/education/schedule-dates'

/** Экземпляр дня рождения: календарная дата и возраст в этот день. */
export interface BirthdayInstance {
  /** Дата празднования ISO 'YYYY-MM-DD'. */
  dateISO: string
  /** Возраст = год празднования − год рождения (всегда ≥ 0, см. клэмп ниже). */
  age: number
}

/** Високосный ли год по григорианскому правилу. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Разворачивает дату рождения в экземпляры «дня рождения» для диапазона
 * [fromISO, toISO] (обе границы ВКЛЮЧИТЕЛЬНО). Для каждого года диапазона, чья
 * дата празднования попадает в окно, эмитим { dateISO, age }.
 *
 * Возраст: age = год празднования − год рождения. Клэмп «раньше рождения»: если
 * дата празднования РАНЬШЕ самой даты рождения — экземпляр пропускаем (дня
 * рождения до рождения не бывает). В год рождения празднование совпадает с
 * самой датой рождения → age = 0, экземпляр остаётся.
 *
 * 29 февраля: в невисокосный год празднуем 28 февраля (выбор: конец февраля, а
 * не 1 марта — так «день рождения» остаётся в том же месяце). В високосный год —
 * ровно 29 февраля.
 *
 * null/неразбираемая birth_date или from > to → []. Чистая: без Date.now.
 */
export function birthdayInstances(
  birthDateISO: string | null,
  fromISO: string,
  toISO: string,
): BirthdayInstance[] {
  if (!birthDateISO) return []
  const birthMs = parseDateUTC(birthDateISO)
  const fromMs = parseDateUTC(fromISO)
  const toMs = parseDateUTC(toISO)
  if (birthMs === null || fromMs === null || toMs === null || fromMs > toMs) return []

  const birth = new Date(birthMs)
  const birthYear = birth.getUTCFullYear()
  const birthMonth = birth.getUTCMonth()          // 0-based
  const birthDay = birth.getUTCDate()
  // Родился ли человек 29 февраля — тогда в невисокосные годы сдвигаем на 28-е.
  const bornOnLeapDay = birthMonth === 1 && birthDay === 29

  const fromYear = new Date(fromMs).getUTCFullYear()
  const toYear = new Date(toMs).getUTCFullYear()

  const out: BirthdayInstance[] = []
  for (let y = fromYear; y <= toYear; y++) {
    const day = bornOnLeapDay && !isLeapYear(y) ? 28 : birthDay
    const ms = Date.UTC(y, birthMonth, day)
    // Клэмп: не празднуем до самого дня рождения.
    if (ms < birthMs) continue
    // Границы диапазона включительны.
    if (ms < fromMs || ms > toMs) continue
    out.push({ dateISO: fmtDateUTC(ms), age: y - birthYear })
  }
  return out
}
