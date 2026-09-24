import { describe, it, expect } from 'vitest'
import { csvCell, toCsv } from './csv'

describe('csvCell', () => {
  it('простые значения — без кавычек', () => {
    expect(csvCell('abc')).toBe('abc')
    expect(csvCell(42)).toBe('42')
  })
  it('null/undefined → пустая строка', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })
  it('запятая/кавычка/перевод строки → экранирование в кавычках', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('a"b')).toBe('"a""b"')
    expect(csvCell('a\nb')).toBe('"a\nb"')
  })
})

describe('toCsv', () => {
  it('собирает строки через CRLF', () => {
    const csv = toCsv([
      ['name', 'score'],
      ['דנה', 90],
      ['a,b', null],
    ])
    expect(csv).toBe('name,score\r\nדנה,90\r\n"a,b",')
  })
})
