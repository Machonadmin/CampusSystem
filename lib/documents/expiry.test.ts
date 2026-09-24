import { describe, it, expect } from 'vitest'
import {
  daysUntilExpiry,
  isExpired,
  isExpiringSoon,
  documentStats,
  type DocLike,
} from './expiry'

const TODAY = '2026-07-07'

// Хелпер для краткой сборки документа.
function d(expiry_date: string | null, status = 'active', doc_type = 'other'): DocLike {
  return { expiry_date, status, doc_type }
}

describe('daysUntilExpiry', () => {
  it('0 когда дата окончания = сегодня', () => {
    expect(daysUntilExpiry(TODAY, TODAY)).toBe(0)
  })
  it('положительное для будущих дат — целые сутки', () => {
    expect(daysUntilExpiry('2026-07-08', TODAY)).toBe(1)
    expect(daysUntilExpiry('2026-07-17', TODAY)).toBe(10)
    expect(daysUntilExpiry('2026-08-06', TODAY)).toBe(30)
    expect(daysUntilExpiry('2026-08-07', TODAY)).toBe(31)
  })
  it('отрицательное для прошедших дат', () => {
    expect(daysUntilExpiry('2026-07-06', TODAY)).toBe(-1)
    expect(daysUntilExpiry('2026-06-07', TODAY)).toBe(-30)
  })
  it('корректно пересекает границу месяца и года', () => {
    expect(daysUntilExpiry('2027-01-01', '2026-12-31')).toBe(1)
    expect(daysUntilExpiry('2026-03-01', '2026-02-28')).toBe(1) // 2026 — невисокосный
  })
})

describe('isExpired', () => {
  it('true когда активен и дата окончания строго в прошлом', () => {
    expect(isExpired(d('2026-07-06'), TODAY)).toBe(true)
    expect(isExpired(d('2026-01-01'), TODAY)).toBe(true)
  })
  it('false когда дата окончания = сегодня (граница → истекает сегодня, ещё действителен)', () => {
    expect(isExpired(d(TODAY), TODAY)).toBe(false)
  })
  it('false для будущей даты окончания', () => {
    expect(isExpired(d('2026-07-08'), TODAY)).toBe(false)
  })
  it('false когда даты окончания нет (бессрочный)', () => {
    expect(isExpired(d(null), TODAY)).toBe(false)
  })
  it('false для архивного документа даже с просроченной датой', () => {
    expect(isExpired(d('2026-07-06', 'archived'), TODAY)).toBe(false)
  })
})

describe('isExpiringSoon', () => {
  it('true когда активен и дата в пределах порога (по умолчанию 30 дней)', () => {
    expect(isExpiringSoon(d('2026-07-08'), TODAY)).toBe(true)
    expect(isExpiringSoon(d('2026-08-06'), TODAY)).toBe(true) // ровно +30
  })
  it('граница: дата окончания = сегодня → истекает скоро (НЕ просрочен)', () => {
    expect(isExpiringSoon(d(TODAY), TODAY)).toBe(true)
    expect(isExpired(d(TODAY), TODAY)).toBe(false)
  })
  it('false когда до окончания больше порога', () => {
    expect(isExpiringSoon(d('2026-08-07'), TODAY)).toBe(false) // +31 день
  })
  it('false для уже просроченной даты (это isExpired, не «скоро»)', () => {
    expect(isExpiringSoon(d('2026-07-06'), TODAY)).toBe(false)
  })
  it('false когда даты окончания нет', () => {
    expect(isExpiringSoon(d(null), TODAY)).toBe(false)
  })
  it('false для архивного документа даже с близкой датой', () => {
    expect(isExpiringSoon(d('2026-07-08', 'archived'), TODAY)).toBe(false)
  })
  it('уважает пользовательский порог thresholdDays', () => {
    expect(isExpiringSoon(d('2026-07-14'), TODAY, 7)).toBe(true)  // ровно +7
    expect(isExpiringSoon(d('2026-07-15'), TODAY, 7)).toBe(false) // +8 > 7
  })
})

describe('documentStats', () => {
  it('пустой список → все нули и пустой by_type', () => {
    expect(documentStats([], TODAY)).toEqual({
      total: 0, active: 0, archived: 0, expired: 0, expiring_soon: 0, by_type: {},
    })
  })

  it('считает active/archived, раскладывает на expired/expiring_soon и группирует по типам', () => {
    const docs: DocLike[] = [
      d('2026-07-08', 'active', 'passport'),   // active, expiring_soon
      d(TODAY, 'active', 'visa'),              // active, expiring_soon (граница = сегодня)
      d('2026-07-06', 'active', 'id_card'),    // active, expired
      d(null, 'active', 'certificate'),        // active, бессрочный
      d('2026-07-06', 'archived', 'medical'),  // archived — вне счётчиков просрочки
      d('2026-12-31', 'active', 'passport'),   // active, далеко за порогом
    ]
    expect(documentStats(docs, TODAY)).toEqual({
      total: 6,
      active: 5,
      archived: 1,
      expired: 1,
      expiring_soon: 2,
      by_type: { passport: 2, visa: 1, id_card: 1, certificate: 1, medical: 1 },
    })
  })

  it('архивные документы исключены из счётчиков просрочки, но входят в by_type', () => {
    const docs: DocLike[] = [
      d('2026-07-08', 'archived', 'passport'),
      d('2026-07-06', 'archived', 'visa'),
    ]
    expect(documentStats(docs, TODAY)).toEqual({
      total: 2, active: 0, archived: 2, expired: 0, expiring_soon: 0,
      by_type: { passport: 1, visa: 1 },
    })
  })
})
