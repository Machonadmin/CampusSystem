import { describe, it, expect } from 'vitest'
import { normalizePersonName, normalizeEmail, normalizePassport, phoneMatchKeys } from './duplicate-match'

describe('normalizePersonName', () => {
  it('склеивает фамилию/имя/отчество, нижний регистр, схлопнутые пробелы', () => {
    expect(normalizePersonName({ last_name: 'Рохлин', first_name: 'Хана', middle_name: null }))
      .toBe('рохлин хана')
    expect(normalizePersonName({ last_name: '  Cohen ', first_name: '  Sarah  ' }))
      .toBe('cohen sarah')
  })
  it('падает на full_name, если частей нет', () => {
    expect(normalizePersonName({ full_name: 'Chana  Rochlin' })).toBe('chana rochlin')
  })
  it('пусто → пустая строка', () => {
    expect(normalizePersonName({})).toBe('')
  })
  it('два человека с одинаковым именем дают одинаковый ключ', () => {
    const a = normalizePersonName({ first_name: 'חנה', last_name: 'רוכלין' })
    const b = normalizePersonName({ first_name: ' חנה ', last_name: 'רוכלין' })
    expect(a).toBe(b)
  })
})

describe('normalizeEmail / normalizePassport', () => {
  it('email — нижний регистр и обрезка', () => {
    expect(normalizeEmail('  Chana.R@Machon5.org ')).toBe('chana.r@machon5.org')
    expect(normalizeEmail(null)).toBe('')
  })
  it('паспорт — без пробелов, нижний регистр', () => {
    expect(normalizePassport(' 032 445 119 ')).toBe('032445119')
    expect(normalizePassport(null)).toBe('')
  })
})

describe('phoneMatchKeys', () => {
  it('берёт последние 9 цифр — устойчиво к префиксу страны', () => {
    expect(phoneMatchKeys([{ type: 'mobile', number: '+972-50-123-4567' }])).toEqual(['501234567'])
    expect(phoneMatchKeys([{ type: 'mobile', number: '050-123-4567' }])).toEqual(['501234567'])
  })
  it('совпадение двух записей одного номера с разными префиксами', () => {
    const a = phoneMatchKeys([{ number: '+972501234567' }])
    const b = phoneMatchKeys([{ number: '0501234567' }])
    expect(a[0]).toBe(b[0])
  })
  it('короткие/мусорные номера отбрасываются', () => {
    expect(phoneMatchKeys([{ number: '123' }])).toEqual([])
    expect(phoneMatchKeys('not-an-array')).toEqual([])
    expect(phoneMatchKeys([])).toEqual([])
  })
  it('поддерживает голые строки, не только {number}', () => {
    expect(phoneMatchKeys(['0501234567'])).toEqual(['501234567'])
  })
})
