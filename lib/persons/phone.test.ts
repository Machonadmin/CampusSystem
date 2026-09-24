import { describe, it, expect } from 'vitest'
import { firstPhone, phoneList, flattenPhones } from './phone'

// Телефоны хранятся как JSONB [{type, number}], но исторически местами писались
// голыми строками. Если объект телефона утечёт в JSX — React падает (#31),
// поэтому хелперы обязаны ВСЕГДА возвращать строки.
describe('firstPhone', () => {
  it('берёт первый непустой номер из объектов и из строк', () => {
    expect(firstPhone([{ type: 'mobile', number: '+972501234567' }])).toBe('+972501234567')
    expect(firstPhone(['+79990000000'])).toBe('+79990000000')
    expect(firstPhone([{ type: 'home', number: '' }, { type: 'mobile', number: '050' }])).toBe('050')
    expect(firstPhone(['   ', '051'])).toBe('051')
  })
  it('обрезает пробелы', () => {
    expect(firstPhone([{ type: 'm', number: '  050-1  ' }])).toBe('050-1')
    expect(firstPhone(['  052  '])).toBe('052')
  })
  it('null для не-массива, пустого массива и записей без номера', () => {
    for (const v of [null, undefined, '', 0, {}, { number: '050' }, 'not-an-array']) {
      expect(firstPhone(v), JSON.stringify(v)).toBeNull()
    }
    expect(firstPhone([])).toBeNull()
    expect(firstPhone([null, undefined, {}, { number: 42 }, { number: null }, ''])).toBeNull()
  })
})

describe('phoneList / flattenPhones', () => {
  it('возвращает только строки, отбрасывая пустые и битые записи', () => {
    const raw = [{ type: 'm', number: '050' }, '051', { type: 'h', number: '  ' }, null, { number: 7 }, '']
    expect(phoneList(raw)).toEqual(['050', '051'])
    expect(phoneList(raw).every(x => typeof x === 'string')).toBe(true)
  })
  it('пустой массив для не-массива', () => {
    for (const v of [null, undefined, 'x', 5, {}]) expect(phoneList(v)).toEqual([])
  })
  it('flattenPhones — псевдоним phoneList (единый источник фикса React #31)', () => {
    const raw = [{ type: 'm', number: '050' }, '051']
    expect(flattenPhones(raw)).toEqual(phoneList(raw))
    expect(flattenPhones(null)).toEqual([])
  })
})
