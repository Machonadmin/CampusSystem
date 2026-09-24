import { describe, it, expect } from 'vitest'
import { generateSeriesDates, validateRecurrenceRule, SERIES_LIMIT, type RecurrenceRule } from './recurrence'

const dates = (r: RecurrenceRule, start: string) => generateSeriesDates(r, start).map(x => x.due_date)

describe('validateRecurrenceRule', () => {
  it('отклоняет неизвестную частоту', () => {
    expect(() => validateRecurrenceRule({ frequency: 'hourly' as never, end_type: 'never' }))
      .toThrow()
  })

  it('weekly без дней недели → ошибка', () => {
    expect(() => validateRecurrenceRule({ frequency: 'weekly', weekdays: [], end_type: 'never' }))
      .toThrow()
  })

  it('weekly с днём вне 1-7 → ошибка', () => {
    expect(() => validateRecurrenceRule({ frequency: 'weekly', weekdays: [0], end_type: 'never' }))
      .toThrow()
    expect(() => validateRecurrenceRule({ frequency: 'weekly', weekdays: [8], end_type: 'never' }))
      .toThrow()
  })

  it('monthly_day вне 1-31 → ошибка', () => {
    expect(() => validateRecurrenceRule({ frequency: 'monthly', monthly_day: 32, end_type: 'never' }))
      .toThrow()
    expect(() => validateRecurrenceRule({ frequency: 'monthly', monthly_day: 0, end_type: 'never' }))
      .toThrow()
  })

  it('yearly с неверными month/day → ошибка', () => {
    expect(() => validateRecurrenceRule({ frequency: 'yearly', yearly_month: 13, yearly_day: 1, end_type: 'never' }))
      .toThrow()
    expect(() => validateRecurrenceRule({ frequency: 'yearly', yearly_month: 2, yearly_day: 40, end_type: 'never' }))
      .toThrow()
  })

  it('until_date без даты → ошибка', () => {
    expect(() => validateRecurrenceRule({ frequency: 'daily', end_type: 'until_date' }))
      .toThrow()
  })

  it('after_count вне диапазона → ошибка', () => {
    expect(() => validateRecurrenceRule({ frequency: 'daily', end_type: 'after_count', end_after_count: 0 }))
      .toThrow()
    expect(() => validateRecurrenceRule({ frequency: 'daily', end_type: 'after_count', end_after_count: SERIES_LIMIT + 1 }))
      .toThrow()
  })

  it('валидные правила проходят', () => {
    expect(() => validateRecurrenceRule({ frequency: 'daily', end_type: 'never' })).not.toThrow()
    expect(() => validateRecurrenceRule({ frequency: 'weekly', weekdays: [1, 3, 5], end_type: 'after_count', end_after_count: 10 })).not.toThrow()
  })

  it('бросает ошибку со .status = 400', () => {
    try {
      validateRecurrenceRule({ frequency: 'weekly', weekdays: [], end_type: 'never' })
      expect.unreachable()
    } catch (e) {
      expect((e as { status?: number }).status).toBe(400)
    }
  })
})

describe('generateSeriesDates — daily', () => {
  it('after_count даёт ровно N подряд идущих дней', () => {
    expect(dates({ frequency: 'daily', end_type: 'after_count', end_after_count: 5 }, '2026-01-01'))
      .toEqual(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'])
  })

  it('until_date включительно', () => {
    expect(dates({ frequency: 'daily', end_type: 'until_date', end_date: '2026-01-03' }, '2026-01-01'))
      .toEqual(['2026-01-01', '2026-01-02', '2026-01-03'])
  })

  it('пересекает границу месяца корректно', () => {
    expect(dates({ frequency: 'daily', end_type: 'after_count', end_after_count: 3 }, '2026-01-30'))
      .toEqual(['2026-01-30', '2026-01-31', '2026-02-01'])
  })
})

describe('generateSeriesDates — weekly', () => {
  it('фильтрует по дням недели (1 января 2026 — четверг)', () => {
    // только понедельники начиная с 2026-01-01
    expect(dates({ frequency: 'weekly', weekdays: [1], end_type: 'after_count', end_after_count: 3 }, '2026-01-01'))
      .toEqual(['2026-01-05', '2026-01-12', '2026-01-19'])
  })

  it('несколько дней недели в правильном порядке', () => {
    // Пн и Пт, 4 штуки, от четверга 2026-01-01
    expect(dates({ frequency: 'weekly', weekdays: [1, 5], end_type: 'after_count', end_after_count: 4 }, '2026-01-01'))
      .toEqual(['2026-01-02', '2026-01-05', '2026-01-09', '2026-01-12'])
  })

  it('пустая серия (нет совпадений в окне) → ошибка', () => {
    // Пн, но окно Чт..Сб — понедельника нет
    expect(() => dates({ frequency: 'weekly', weekdays: [1], end_type: 'until_date', end_date: '2026-01-03' }, '2026-01-01'))
      .toThrow()
  })
})

describe('generateSeriesDates — monthly', () => {
  it('день 31 схлопывается к последнему дню короткого месяца', () => {
    expect(dates({ frequency: 'monthly', monthly_day: 31, end_type: 'after_count', end_after_count: 3 }, '2026-01-15'))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('пропускает первый месяц, если целевой день уже прошёл', () => {
    // старт 20-е, целевой день 15-е → январь 15 < старт, начинаем с февраля
    expect(dates({ frequency: 'monthly', monthly_day: 15, end_type: 'after_count', end_after_count: 2 }, '2026-01-20'))
      .toEqual(['2026-02-15', '2026-03-15'])
  })

  it('високосный февраль даёт 29-е для дня 29', () => {
    expect(dates({ frequency: 'monthly', monthly_day: 29, end_type: 'until_date', end_date: '2028-02-29' }, '2028-02-01'))
      .toEqual(['2028-02-29'])
  })
})

describe('generateSeriesDates — yearly', () => {
  it('29 февраля схлопывается в невисокосные годы и возвращается в високосный', () => {
    expect(dates({ frequency: 'yearly', yearly_month: 2, yearly_day: 29, end_type: 'after_count', end_after_count: 3 }, '2026-01-01'))
      .toEqual(['2026-02-28', '2027-02-28', '2028-02-29'])
  })
})

describe('generateSeriesDates — общие ограничения', () => {
  it('until_date раньше старта → ошибка', () => {
    expect(() => dates({ frequency: 'daily', end_type: 'until_date', end_date: '2025-12-31' }, '2026-01-01'))
      .toThrow()
  })

  it('after_count не превышает лимит серии', () => {
    const out = dates({ frequency: 'daily', end_type: 'after_count', end_after_count: SERIES_LIMIT }, '2026-01-01')
    expect(out.length).toBe(SERIES_LIMIT)
  })
})
