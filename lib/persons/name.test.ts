import { describe, it, expect } from 'vitest'
import { personDisplayName, compareNames } from './name'

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

describe('compareNames — списки людей по алфавиту', () => {
  it('русские имена по алфавиту (жалоба: Ширяева шла раньше Алямовской)', () => {
    const names = ['Ширяева Лайла', 'Харишманова Мирьям', 'Хлюстова Лея', 'Цивончик Ханна', 'Алямовская Екатерина']
    expect([...names].sort(compareNames)).toEqual([
      'Алямовская Екатерина', 'Харишманова Мирьям', 'Хлюстова Лея', 'Цивончик Ханна', 'Ширяева Лайла',
    ])
  })
  it('ивритские имена по алфавиту', () => {
    expect(['שרה', 'אסתר', 'מרים'].sort(compareNames)).toEqual(['אסתר', 'מרים', 'שרה'])
  })
  it('регистр и пробелы по краям не важны, пустое имя не падает', () => {
    expect(compareNames(' anna', 'Anna')).toBe(0)
    expect(compareNames(null, 'א')).toBeLessThan(0)
  })
})
