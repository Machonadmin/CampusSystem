import { describe, it, expect } from 'vitest'
import { matchesContact, filterByContact, filterByName, nameKey } from './contact-match'

describe('matchesContact', () => {
  it('совпадение email без учёта регистра/пробелов', () => {
    expect(matchesContact({ id: 'a', phones: [], email: 'Sara@Mail.com ' }, { phones: [], email: 'sara@mail.com' })).toBe(true)
  })
  it('совпадение телефона по последним 9 цифрам (разные форматы)', () => {
    const row = { id: 'a', phones: [{ type: 'mobile', number: '+972-50-123-4567' }], email: null }
    expect(matchesContact(row, { phones: ['050 1234567'], email: null })).toBe(true)
    expect(matchesContact({ id: 'b', phones: ['0501234567'], email: null }, { phones: ['+972501234567'], email: null })).toBe(true)
  })
  it('нет совпадения — false; пустые контакты не совпадают с пустыми', () => {
    expect(matchesContact({ id: 'a', phones: ['0501234567'], email: 'x@y.z' }, { phones: ['0529999999'], email: 'q@y.z' })).toBe(false)
    expect(matchesContact({ id: 'a', phones: [], email: null }, { phones: [], email: null })).toBe(false)
    expect(matchesContact({ id: 'a', phones: [], email: '' }, { phones: [], email: '' })).toBe(false)
  })
  it('короткие номера (<7 цифр) не участвуют', () => {
    expect(matchesContact({ id: 'a', phones: ['12345'], email: null }, { phones: ['12345'], email: null })).toBe(false)
  })
})

describe('filterByContact', () => {
  it('возвращает все совпавшие id без повторов', () => {
    const rows = [
      { id: 'a', phones: ['0501234567'], email: null },
      { id: 'b', phones: [], email: 'sara@mail.com' },
      { id: 'c', phones: ['0520000000'], email: 'other@mail.com' },
      { id: 'a', phones: ['0501234567'], email: null },
    ]
    expect(filterByContact(rows, { phones: ['050-123-4567'], email: 'SARA@mail.com' })).toEqual(['a', 'b'])
  })
})

describe('filterByName', () => {
  const rows = [
    { id: 'a', first_name: 'Sarah', last_name: 'Cohen' },
    { id: 'b', first_name: ' sarah ', last_name: 'COHEN' },
    { id: 'c', first_name: 'Sarah', last_name: 'Levi' },
  ]
  it('имя+фамилия без учёта регистра/пробелов', () => {
    expect(filterByName(rows, 'SARAH', 'cohen')).toEqual(['a', 'b'])
  })
  it('без фамилии или имени — не помечаем', () => {
    expect(filterByName(rows, 'Sarah', null)).toEqual([])
    expect(filterByName(rows, '', 'Cohen')).toEqual([])
  })
  it('nameKey игнорирует отчество', () => {
    expect(nameKey('חנה', 'רוכלין')).toBe('רוכלין חנה')
  })
})
