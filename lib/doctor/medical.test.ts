import { describe, it, expect } from 'vitest'
import {
  daysUntil,
  isUpcomingFollowUp,
  isOverdueFollowUp,
  canTransitionVisit,
  visitStats,
  type VisitLike,
} from './medical'

const TODAY = '2026-07-07'

// Хелпер для краткой сборки визита.
function v(follow_up_date: string | null, status = 'open'): VisitLike {
  return { follow_up_date, status }
}

describe('daysUntil', () => {
  it('0 когда дата = сегодня', () => {
    expect(daysUntil(TODAY, TODAY)).toBe(0)
  })
  it('положительное для будущих дат — целые сутки', () => {
    expect(daysUntil('2026-07-08', TODAY)).toBe(1)
    expect(daysUntil('2026-07-17', TODAY)).toBe(10)
    expect(daysUntil('2026-08-07', TODAY)).toBe(31)
  })
  it('отрицательное для прошедших дат', () => {
    expect(daysUntil('2026-07-06', TODAY)).toBe(-1)
    expect(daysUntil('2026-06-07', TODAY)).toBe(-30)
  })
  it('корректно пересекает границу месяца и года', () => {
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1)
    expect(daysUntil('2026-03-01', '2026-02-28')).toBe(1) // 2026 — невисокосный
  })
})

describe('isUpcomingFollowUp', () => {
  it('true когда открыт и дата контроля в будущем', () => {
    expect(isUpcomingFollowUp(v('2026-07-08'), TODAY)).toBe(true)
  })
  it('граница: дата контроля = сегодня → предстоящий (НЕ просроченный)', () => {
    expect(isUpcomingFollowUp(v(TODAY), TODAY)).toBe(true)
    expect(isOverdueFollowUp(v(TODAY), TODAY)).toBe(false)
  })
  it('false для прошедшей даты контроля', () => {
    expect(isUpcomingFollowUp(v('2026-07-06'), TODAY)).toBe(false)
  })
  it('false когда даты контроля нет', () => {
    expect(isUpcomingFollowUp(v(null), TODAY)).toBe(false)
  })
  it('false для закрытого приёма даже с будущей датой контроля', () => {
    expect(isUpcomingFollowUp(v('2026-07-08', 'closed'), TODAY)).toBe(false)
  })
})

describe('isOverdueFollowUp', () => {
  it('true когда открыт и дата контроля строго в прошлом', () => {
    expect(isOverdueFollowUp(v('2026-07-06'), TODAY)).toBe(true)
    expect(isOverdueFollowUp(v('2026-01-01'), TODAY)).toBe(true)
  })
  it('false когда дата контроля = сегодня (граница)', () => {
    expect(isOverdueFollowUp(v(TODAY), TODAY)).toBe(false)
  })
  it('false для будущей даты контроля', () => {
    expect(isOverdueFollowUp(v('2026-07-08'), TODAY)).toBe(false)
  })
  it('false когда даты контроля нет', () => {
    expect(isOverdueFollowUp(v(null), TODAY)).toBe(false)
  })
  it('false для закрытого приёма даже с просроченной датой контроля', () => {
    expect(isOverdueFollowUp(v('2026-07-06', 'closed'), TODAY)).toBe(false)
  })
})

describe('canTransitionVisit', () => {
  it('open → closed разрешён', () => {
    expect(canTransitionVisit('open', 'closed')).toBe(true)
  })
  it('closed → open разрешён (переоткрытие)', () => {
    expect(canTransitionVisit('closed', 'open')).toBe(true)
  })
  it('переход в тот же статус запрещён', () => {
    expect(canTransitionVisit('open', 'open')).toBe(false)
    expect(canTransitionVisit('closed', 'closed')).toBe(false)
  })
  it('неизвестные статусы запрещены', () => {
    expect(canTransitionVisit('open', 'cancelled')).toBe(false)
    expect(canTransitionVisit('archived', 'open')).toBe(false)
    expect(canTransitionVisit('', 'closed')).toBe(false)
  })
})

describe('visitStats', () => {
  it('пустой список → все нули', () => {
    expect(visitStats([], TODAY)).toEqual({
      total: 0, open: 0, closed: 0, upcoming_followups: 0, overdue_followups: 0,
    })
  })

  it('считает open/closed и раскладывает контрольные на upcoming/overdue', () => {
    const visits: VisitLike[] = [
      v('2026-07-08'),          // open, upcoming
      v(TODAY),                 // open, upcoming (граница = сегодня)
      v('2026-07-06'),          // open, overdue
      v(null),                  // open, без контроля
      v('2026-07-01', 'closed'),// closed — вне счётчиков контроля
      v('2026-07-20', 'closed'),// closed — вне счётчиков контроля
    ]
    expect(visitStats(visits, TODAY)).toEqual({
      total: 6,
      open: 4,
      closed: 2,
      upcoming_followups: 2,
      overdue_followups: 1,
    })
  })

  it('закрытые приёмы исключены из счётчиков контроля', () => {
    const visits: VisitLike[] = [
      v('2026-07-08', 'closed'),
      v('2026-07-06', 'closed'),
    ]
    expect(visitStats(visits, TODAY)).toEqual({
      total: 2, open: 0, closed: 2, upcoming_followups: 0, overdue_followups: 0,
    })
  })
})
