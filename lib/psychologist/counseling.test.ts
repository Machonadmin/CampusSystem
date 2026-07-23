import { describe, it, expect } from 'vitest'
import {
  daysUntil,
  isUpcomingFollowUp,
  isOverdueFollowUp,
  canTransitionSession,
  sessionStats,
  type SessionLike,
} from './counseling'

const TODAY = '2026-07-07'

// Хелпер для краткой сборки сессии.
function s(follow_up_date: string | null, status = 'open'): SessionLike {
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
  it('true когда открыта и дата контроля в будущем', () => {
    expect(isUpcomingFollowUp(s('2026-07-08'), TODAY)).toBe(true)
  })
  it('граница: дата контроля = сегодня → предстоящая (НЕ просроченная)', () => {
    expect(isUpcomingFollowUp(s(TODAY), TODAY)).toBe(true)
    expect(isOverdueFollowUp(s(TODAY), TODAY)).toBe(false)
  })
  it('false для прошедшей даты контроля', () => {
    expect(isUpcomingFollowUp(s('2026-07-06'), TODAY)).toBe(false)
  })
  it('false когда даты контроля нет', () => {
    expect(isUpcomingFollowUp(s(null), TODAY)).toBe(false)
  })
  it('false для закрытой сессии даже с будущей датой контроля', () => {
    expect(isUpcomingFollowUp(s('2026-07-08', 'closed'), TODAY)).toBe(false)
  })
})

describe('isOverdueFollowUp', () => {
  it('true когда открыта и дата контроля строго в прошлом', () => {
    expect(isOverdueFollowUp(s('2026-07-06'), TODAY)).toBe(true)
    expect(isOverdueFollowUp(s('2026-01-01'), TODAY)).toBe(true)
  })
  it('false когда дата контроля = сегодня (граница)', () => {
    expect(isOverdueFollowUp(s(TODAY), TODAY)).toBe(false)
  })
  it('false для будущей даты контроля', () => {
    expect(isOverdueFollowUp(s('2026-07-08'), TODAY)).toBe(false)
  })
  it('false когда даты контроля нет', () => {
    expect(isOverdueFollowUp(s(null), TODAY)).toBe(false)
  })
  it('false для закрытой сессии даже с просроченной датой контроля', () => {
    expect(isOverdueFollowUp(s('2026-07-06', 'closed'), TODAY)).toBe(false)
  })
})

describe('canTransitionSession', () => {
  it('open → closed разрешён', () => {
    expect(canTransitionSession('open', 'closed')).toBe(true)
  })
  it('closed → open разрешён (переоткрытие)', () => {
    expect(canTransitionSession('closed', 'open')).toBe(true)
  })
  it('переход в тот же статус запрещён', () => {
    expect(canTransitionSession('open', 'open')).toBe(false)
    expect(canTransitionSession('closed', 'closed')).toBe(false)
  })
  it('неизвестные статусы запрещены', () => {
    expect(canTransitionSession('open', 'cancelled')).toBe(false)
    expect(canTransitionSession('archived', 'open')).toBe(false)
    expect(canTransitionSession('', 'closed')).toBe(false)
  })
})

describe('sessionStats', () => {
  it('пустой список → все нули', () => {
    expect(sessionStats([], TODAY)).toEqual({
      total: 0, open: 0, closed: 0, upcoming_followups: 0, overdue_followups: 0,
    })
  })

  it('считает open/closed и раскладывает контрольные на upcoming/overdue', () => {
    const sessions: SessionLike[] = [
      s('2026-07-08'),          // open, upcoming
      s(TODAY),                 // open, upcoming (граница = сегодня)
      s('2026-07-06'),          // open, overdue
      s(null),                  // open, без контроля
      s('2026-07-01', 'closed'),// closed — вне счётчиков контроля
      s('2026-07-20', 'closed'),// closed — вне счётчиков контроля
    ]
    expect(sessionStats(sessions, TODAY)).toEqual({
      total: 6,
      open: 4,
      closed: 2,
      upcoming_followups: 2,
      overdue_followups: 1,
    })
  })

  it('закрытые сессии исключены из счётчиков контроля', () => {
    const sessions: SessionLike[] = [
      s('2026-07-08', 'closed'),
      s('2026-07-06', 'closed'),
    ]
    expect(sessionStats(sessions, TODAY)).toEqual({
      total: 2, open: 0, closed: 2, upcoming_followups: 0, overdue_followups: 0,
    })
  })
})
