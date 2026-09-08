import { describe, it, expect } from 'vitest'
import { personDisplayName } from './name'

// Ивритское имя приоритетнее «легального»; результат ВСЕГДА строка (это имя
// подставляется прямо в JSX по всему приложению).
describe('personDisplayName', () => {
  it('иврит важнее full_name', () => {
    expect(personDisplayName({ hebrew_name: 'שרה', full_name: 'Сара' })).toBe('שרה')
  })
  it('без иврита — full_name', () => {
    expect(personDisplayName({ hebrew_name: null, full_name: 'Сара' })).toBe('Сара')
    expect(personDisplayName({ hebrew_name: '', full_name: 'Сара' })).toBe('Сара')
    expect(personDisplayName({ full_name: 'Сара' })).toBe('Сара')
  })
  it('обрезает пробелы', () => {
    expect(personDisplayName({ hebrew_name: '  שרה  ' })).toBe('שרה')
    expect(personDisplayName({ full_name: ' Сара ' })).toBe('Сара')
  })
  it('пустая строка вместо null/undefined (в JSX не должно попасть "null")', () => {
    expect(personDisplayName(null)).toBe('')
    expect(personDisplayName(undefined)).toBe('')
    expect(personDisplayName({})).toBe('')
    expect(personDisplayName({ hebrew_name: null, full_name: null })).toBe('')
  })
})
