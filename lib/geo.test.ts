import { describe, it, expect } from 'vitest'
import { countryLabel, POPULAR_COUNTRIES, ALL_COUNTRIES } from './geo'

// Каноническое значение страны хранится по-русски; countryLabel только
// ПОКАЗЫВАЕТ его на языке интерфейса и никогда не меняет сохранённое значение.
describe('countryLabel', () => {
  it('переводит частые страны на иврит и английский', () => {
    expect(countryLabel('Израиль', 'he')).toBe('ישראל')
    expect(countryLabel('Израиль', 'en')).toBe('Israel')
    expect(countryLabel('Россия', 'he')).toBe('רוסיה')
    expect(countryLabel('Великобритания', 'en')).toBe('United Kingdom')
  })
  it('для ru возвращает каноническое значение как есть', () => {
    expect(countryLabel('Израиль', 'ru')).toBe('Израиль')
    expect(countryLabel('Тувалу', 'ru')).toBe('Тувалу')
  })
  it('редкая страна без перевода остаётся по-русски (а не пустой)', () => {
    expect(countryLabel('Тувалу', 'he')).toBe('Тувалу')
    expect(countryLabel('Тувалу', 'en')).toBe('Тувалу')
  })
  it('пустое значение возвращается без изменений', () => {
    expect(countryLabel('', 'he')).toBe('')
    expect(countryLabel('', 'en')).toBe('')
  })
  it('перевод не подменяет значение: длина списка стран не меняется от языка', () => {
    const he = ALL_COUNTRIES.map(c => countryLabel(c, 'he'))
    expect(he).toHaveLength(ALL_COUNTRIES.length)
    expect(new Set(he).size).toBe(new Set(ALL_COUNTRIES).size) // переводы не схлопывают страны
  })
})

describe('справочники стран', () => {
  it('популярные страны все присутствуют в полном списке', () => {
    for (const c of POPULAR_COUNTRIES) expect(ALL_COUNTRIES, c).toContain(c)
  })
  it('в полном списке нет дублей', () => {
    expect(new Set(ALL_COUNTRIES).size).toBe(ALL_COUNTRIES.length)
  })
})
