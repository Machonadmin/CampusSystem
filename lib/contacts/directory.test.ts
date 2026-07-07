import { describe, it, expect } from 'vitest'
import {
  isValidEmail,
  matchesSearch,
  contactStats,
  type ContactSearchable,
  type ContactStatLike,
} from './directory'

// Хелпер для краткой сборки контакта под поиск.
function c(over: Partial<ContactSearchable> = {}): ContactSearchable {
  return {
    name: 'Офис снабжения',
    email: 'office@supplier.co.il',
    phone: '03-5551234',
    contact_person: 'Дана Леви',
    category: 'supplier',
    ...over,
  }
}

describe('isValidEmail', () => {
  it('true для обычных адресов', () => {
    expect(isValidEmail('a@b.co')).toBe(true)
    expect(isValidEmail('office@supplier.co.il')).toBe(true)
    expect(isValidEmail('first.last+tag@sub.domain.org')).toBe(true)
  })
  it('false для пустой строки', () => {
    expect(isValidEmail('')).toBe(false)
  })
  it('false без @ или с пустой локальной частью', () => {
    expect(isValidEmail('no-at-sign.com')).toBe(false)
    expect(isValidEmail('@domain.com')).toBe(false)
  })
  it('false с более чем одним @', () => {
    expect(isValidEmail('a@@b.com')).toBe(false)
    expect(isValidEmail('a@b@c.com')).toBe(false)
  })
  it('false когда в домене нет точки или точка с краю', () => {
    expect(isValidEmail('a@domain')).toBe(false)
    expect(isValidEmail('a@.com')).toBe(false)
    expect(isValidEmail('a@domain.')).toBe(false)
  })
  it('false для пустых меток домена — точка в начале или двойная точка', () => {
    expect(isValidEmail('a@.b.com')).toBe(false)
    expect(isValidEmail('a@b..com')).toBe(false)
  })
  it('false с пробельными символами', () => {
    expect(isValidEmail('a b@c.com')).toBe(false)
    expect(isValidEmail('a@c.com ')).toBe(false)
    expect(isValidEmail('a@c\t.com')).toBe(false)
  })
})

describe('matchesSearch', () => {
  it('пустой или пробельный запрос совпадает со всеми', () => {
    expect(matchesSearch(c(), '')).toBe(true)
    expect(matchesSearch(c(), '   ')).toBe(true)
  })
  it('ищет по имени без учёта регистра', () => {
    expect(matchesSearch(c(), 'офис')).toBe(true)
    expect(matchesSearch(c(), 'ОФИС')).toBe(true)
  })
  it('ищет по email, телефону, контактному лицу и категории', () => {
    expect(matchesSearch(c(), 'supplier.co')).toBe(true)
    expect(matchesSearch(c(), '5551234')).toBe(true)
    expect(matchesSearch(c(), 'дана')).toBe(true)
    expect(matchesSearch(c(), 'supplier')).toBe(true)
  })
  it('null-поля не ломают поиск и не совпадают', () => {
    const bare = c({ email: null, phone: null, contact_person: null })
    expect(matchesSearch(bare, 'офис')).toBe(true)
    expect(matchesSearch(bare, '5551234')).toBe(false)
  })
  it('ищет по категории изолированно — остальные поля не содержат запрос', () => {
    const bare = c({ email: null, phone: null, contact_person: null })
    // имя 'Офис снабжения' не содержит 'supplier' — совпасть может только категория
    expect(matchesSearch(bare, 'supplier')).toBe(true)
  })
  it('false когда подстроки нет ни в одном поле', () => {
    expect(matchesSearch(c(), 'нет-такого')).toBe(false)
  })
  it('обрезает пробелы вокруг запроса', () => {
    expect(matchesSearch(c(), '  офис  ')).toBe(true)
  })
})

describe('contactStats', () => {
  it('пустой список → нули и пустые разбивки', () => {
    expect(contactStats([])).toEqual({
      total: 0, active: 0, by_type: {}, by_category: {},
    })
  })

  it('считает total/active и группирует по типу и категории', () => {
    const contacts: ContactStatLike[] = [
      { contact_type: 'organization', category: 'supplier', is_active: true },
      { contact_type: 'organization', category: 'supplier', is_active: false },
      { contact_type: 'person', category: 'emergency', is_active: true },
      { contact_type: 'organization', category: 'government', is_active: true },
    ]
    expect(contactStats(contacts)).toEqual({
      total: 4,
      active: 3,
      by_type: { organization: 3, person: 1 },
      by_category: { supplier: 2, emergency: 1, government: 1 },
    })
  })

  it('неактивные входят в разбивки, но не в active', () => {
    const contacts: ContactStatLike[] = [
      { contact_type: 'person', category: 'medical', is_active: false },
      { contact_type: 'person', category: 'medical', is_active: false },
    ]
    expect(contactStats(contacts)).toEqual({
      total: 2, active: 0, by_type: { person: 2 }, by_category: { medical: 2 },
    })
  })
})
