export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type RecurrenceEndType = 'never' | 'until_date' | 'after_count'

export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  time?: string | null            // 'HH:MM' для daily
  weekdays?: number[] | null      // 1..7 (ISO) для weekly
  monthly_day?: number | null     // 1..31 для monthly
  yearly_month?: number | null    // 1..12 для yearly
  yearly_day?: number | null      // 1..31 для yearly
  end_type: RecurrenceEndType
  end_date?: string | null        // 'YYYY-MM-DD'
  end_after_count?: number | null
}

export const SERIES_LIMIT = 500
export const NEVER_HORIZON_DAYS = 365

/**
 * Валидирует правило повторения. Бросает ошибку с .status=400 если невалидно.
 */
export function validateRecurrenceRule(rule: RecurrenceRule): void {
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(rule.frequency)) {
    throw Object.assign(new Error('Неверная частота повторения'), { status: 400 })
  }

  if (rule.frequency === 'weekly') {
    if (!Array.isArray(rule.weekdays) || rule.weekdays.length === 0) {
      throw Object.assign(new Error('Для еженедельной частоты укажите дни недели'), { status: 400 })
    }
    for (const wd of rule.weekdays) {
      if (!Number.isInteger(wd) || wd < 1 || wd > 7) {
        throw Object.assign(new Error('weekdays: значения 1-7 (1=Пн)'), { status: 400 })
      }
    }
  }

  if (rule.frequency === 'monthly') {
    if (!Number.isInteger(rule.monthly_day) || (rule.monthly_day! < 1) || (rule.monthly_day! > 31)) {
      throw Object.assign(new Error('monthly_day: 1-31'), { status: 400 })
    }
  }

  if (rule.frequency === 'yearly') {
    if (!Number.isInteger(rule.yearly_month) || rule.yearly_month! < 1 || rule.yearly_month! > 12) {
      throw Object.assign(new Error('yearly_month: 1-12'), { status: 400 })
    }
    if (!Number.isInteger(rule.yearly_day) || rule.yearly_day! < 1 || rule.yearly_day! > 31) {
      throw Object.assign(new Error('yearly_day: 1-31'), { status: 400 })
    }
  }

  if (!['never', 'until_date', 'after_count'].includes(rule.end_type)) {
    throw Object.assign(new Error('Неверный end_type'), { status: 400 })
  }

  if (rule.end_type === 'until_date' && !rule.end_date) {
    throw Object.assign(new Error('end_date обязательно для end_type=until_date'), { status: 400 })
  }
  if (rule.end_type === 'after_count') {
    if (!Number.isInteger(rule.end_after_count) || rule.end_after_count! < 1) {
      throw Object.assign(new Error('end_after_count: положительное число'), { status: 400 })
    }
    if (rule.end_after_count! > SERIES_LIMIT) {
      throw Object.assign(new Error(`Максимум ${SERIES_LIMIT} повторений в серии`), { status: 400 })
    }
  }
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function addMonths(isoDate: string, months: number, targetDay?: number): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  const day = targetDay ?? d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d.toISOString().slice(0, 10)
}

function getIsoWeekday(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00Z')
  const js = d.getUTCDay()  // 0=Вс..6=Сб
  return js === 0 ? 7 : js  // ISO: 1=Пн..7=Вс
}


/**
 * Сгенерировать массив дат для серии.
 * Бросает 400 если результирующий массив > SERIES_LIMIT.
 */
export function generateSeriesDates(
  rule: RecurrenceRule,
  startDate: string  // 'YYYY-MM-DD'
): Array<{ due_date: string }> {
  validateRecurrenceRule(rule)

  let effectiveEndDate: string
  let maxCount: number = SERIES_LIMIT

  if (rule.end_type === 'never') {
    effectiveEndDate = addDays(startDate, NEVER_HORIZON_DAYS)
  } else if (rule.end_type === 'until_date') {
    effectiveEndDate = rule.end_date!
    if (effectiveEndDate < startDate) {
      throw Object.assign(new Error('end_date раньше startDate'), { status: 400 })
    }
  } else {
    effectiveEndDate = addDays(startDate, 365 * 10)
    maxCount = rule.end_after_count!
  }

  const dates: string[] = []

  if (rule.frequency === 'daily') {
    let current = startDate
    while (current <= effectiveEndDate && dates.length < maxCount) {
      dates.push(current)
      current = addDays(current, 1)
    }
  }

  else if (rule.frequency === 'weekly') {
    const wantedWeekdays = new Set(rule.weekdays!)
    let current = startDate
    while (current <= effectiveEndDate && dates.length < maxCount) {
      if (wantedWeekdays.has(getIsoWeekday(current))) {
        dates.push(current)
      }
      current = addDays(current, 1)
    }
  }

  else if (rule.frequency === 'monthly') {
    const targetDay = rule.monthly_day!
    const startD = new Date(startDate + 'T00:00:00Z')
    let year = startD.getUTCFullYear()
    let month = startD.getUTCMonth()  // 0..11

    while (dates.length < maxCount) {
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
      const day = Math.min(targetDay, lastDay)
      const candidate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      if (candidate > effectiveEndDate) break
      if (candidate >= startDate) {
        dates.push(candidate)
      }
      month++
      if (month > 11) { month = 0; year++ }
    }
  }

  else if (rule.frequency === 'yearly') {
    const targetMonth = rule.yearly_month!  // 1..12
    const targetDay = rule.yearly_day!
    const startD = new Date(startDate + 'T00:00:00Z')
    let year = startD.getUTCFullYear()

    while (dates.length < maxCount) {
      const lastDay = new Date(Date.UTC(year, targetMonth, 0)).getUTCDate()
      const day = Math.min(targetDay, lastDay)
      const candidate = `${year}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      if (candidate > effectiveEndDate) break
      if (candidate >= startDate) {
        dates.push(candidate)
      }
      year++
    }
  }

  if (dates.length === 0) {
    throw Object.assign(new Error('Серия не содержит ни одной даты'), { status: 400 })
  }
  if (dates.length > SERIES_LIMIT) {
    throw Object.assign(
      new Error(`Серия превышает лимит в ${SERIES_LIMIT} задач`),
      { status: 400 }
    )
  }

  return dates.map(d => ({ due_date: d }))
}

