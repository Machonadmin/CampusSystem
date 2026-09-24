import { describe, it, expect } from 'vitest'
import { isUpcomingFollowUp, isOverdueFollowUp, canToggleOpenClosed } from './follow-up'

// Контрольные визиты медпункта/психолога. «Сегодня» — параметр, поэтому логика
// детерминирована; граница (дата контроля == сегодня) считается ПРЕДСТОЯЩЕЙ.
const TODAY = '2026-09-08'
const open = (d: string | null) => ({ follow_up_date: d, status: 'open' })
const closed = (d: string | null) => ({ follow_up_date: d, status: 'closed' })

describe('isUpcomingFollowUp', () => {
  it('открытая запись с датой в будущем или сегодня — предстоит', () => {
    expect(isUpcomingFollowUp(open('2026-09-09'), TODAY)).toBe(true)
    expect(isUpcomingFollowUp(open('2027-01-01'), TODAY)).toBe(true)
    expect(isUpcomingFollowUp(open(TODAY), TODAY)).toBe(true)   // граница
  })
  it('прошедшая дата, отсутствие даты и закрытая запись — не предстоит', () => {
    expect(isUpcomingFollowUp(open('2026-09-07'), TODAY)).toBe(false)
    expect(isUpcomingFollowUp(open(null), TODAY)).toBe(false)
    expect(isUpcomingFollowUp(closed('2027-01-01'), TODAY)).toBe(false)
  })
})

describe('isOverdueFollowUp', () => {
  it('открытая запись со СТРОГО прошедшей датой — просрочена', () => {
    expect(isOverdueFollowUp(open('2026-09-07'), TODAY)).toBe(true)
    expect(isOverdueFollowUp(open('2020-01-01'), TODAY)).toBe(true)
  })
  it('сегодня — ещё НЕ просрочена (граница принадлежит «предстоит»)', () => {
    expect(isOverdueFollowUp(open(TODAY), TODAY)).toBe(false)
  })
  it('будущее, отсутствие даты и закрытая запись — не просрочена', () => {
    expect(isOverdueFollowUp(open('2026-09-09'), TODAY)).toBe(false)
    expect(isOverdueFollowUp(open(null), TODAY)).toBe(false)
    expect(isOverdueFollowUp(closed('2020-01-01'), TODAY)).toBe(false)
  })
})

describe('«предстоит» и «просрочено» — взаимоисключающие и полные для открытых записей с датой', () => {
  it('ровно один из двух предикатов истинен', () => {
    for (const d of ['2026-09-06', '2026-09-07', TODAY, '2026-09-09', '2030-12-31']) {
      const x = open(d)
      expect(Number(isUpcomingFollowUp(x, TODAY)) + Number(isOverdueFollowUp(x, TODAY)), d).toBe(1)
    }
  })
  it('переход через границу месяца/года сравнивается хронологически', () => {
    expect(isOverdueFollowUp(open('2025-12-31'), '2026-01-01')).toBe(true)
    expect(isUpcomingFollowUp(open('2026-01-02'), '2026-01-01')).toBe(true)
  })
})

describe('canToggleOpenClosed', () => {
  it('open ↔ closed разрешён в обе стороны (запись можно открыть заново)', () => {
    expect(canToggleOpenClosed('open', 'closed')).toBe(true)
    expect(canToggleOpenClosed('closed', 'open')).toBe(true)
  })
  it('переход в тот же статус запрещён', () => {
    expect(canToggleOpenClosed('open', 'open')).toBe(false)
    expect(canToggleOpenClosed('closed', 'closed')).toBe(false)
  })
  it('любой неизвестный статус запрещён (fail-closed)', () => {
    expect(canToggleOpenClosed('open', 'archived')).toBe(false)
    expect(canToggleOpenClosed('draft', 'closed')).toBe(false)
    expect(canToggleOpenClosed('', 'open')).toBe(false)
    expect(canToggleOpenClosed('open', '')).toBe(false)
  })
})
