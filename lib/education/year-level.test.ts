import { describe, it, expect } from 'vitest'
import { yearLevelLabel, yearLevelTitle } from './year-level'

// На иврите год-ступень принято обозначать буквой (א/ב/ג), иначе — числом.
describe('yearLevelLabel', () => {
  it('иврит — буквы', () => {
    expect(yearLevelLabel(1, 'he')).toBe('א')
    expect(yearLevelLabel(2, 'he')).toBe('ב')
    expect(yearLevelLabel(3, 'he')).toBe('ג')
    expect(yearLevelLabel(4, 'he')).toBe('ד')
  })
  it('прочие языки — число', () => {
    expect(yearLevelLabel(1, 'ru')).toBe('1')
    expect(yearLevelLabel(3, 'en')).toBe('3')
  })
  it('нет года — тире', () => {
    expect(yearLevelLabel(null, 'he')).toBe('—')
    expect(yearLevelLabel(undefined, 'en')).toBe('—')
  })
  it('год вне таблицы букв не ломается (отдаёт число)', () => {
    expect(yearLevelLabel(9, 'he')).toBe('9')
    expect(yearLevelLabel(0, 'he')).toBe('0')   // HE_LETTERS[0] === '' → падать нельзя
  })
})

describe('yearLevelTitle', () => {
  it('добавляет слово-префикс на каждом языке', () => {
    expect(yearLevelTitle(1, 'he')).toBe('שנה א')
    expect(yearLevelTitle(2, 'ru')).toBe('Год 2')
    expect(yearLevelTitle(2, 'en')).toBe('Year 2')
  })
  it('нет года — локализованная заглушка, не "—"', () => {
    expect(yearLevelTitle(null, 'he')).toBe('ללא שנה')
    expect(yearLevelTitle(null, 'ru')).toBe('Без года')
    expect(yearLevelTitle(null, 'en')).toBe('No year')
  })
})
