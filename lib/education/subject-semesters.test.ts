import { describe, it, expect } from 'vitest'
import {
  pickSemesterPrice, isSubjectNameTaken, DEFAULT_SEMESTER_PRICE,
  buildContainerSemesterName, pickOldestContainer,
} from './subject-semesters'

describe('pickSemesterPrice', () => {
  it('явная цена (в т.ч. 0) побеждает', () => {
    expect(pickSemesterPrice(0, [{ term_number: 1, tuition_amount: 5 }])).toBe(0)
    expect(pickSemesterPrice(1234, [])).toBe(1234)
  })
  it('отрицательная/нечисловая → цена существующего семестра с наименьшим номером', () => {
    expect(pickSemesterPrice(-1, [
      { term_number: 2, tuition_amount: 200 },
      { term_number: 1, tuition_amount: 100 },
    ])).toBe(100)
    expect(pickSemesterPrice(undefined, [
      { term_number: 1, tuition_amount: null },
      { term_number: 2, tuition_amount: 300 },
    ])).toBe(300)
  })
  it('нет цены нигде → DEFAULT_SEMESTER_PRICE', () => {
    expect(pickSemesterPrice(undefined, [])).toBe(DEFAULT_SEMESTER_PRICE)
    expect(pickSemesterPrice(undefined, [{ term_number: 1, tuition_amount: null }])).toBe(DEFAULT_SEMESTER_PRICE)
  })
})

describe('isSubjectNameTaken', () => {
  const rows = [{ name: 'Дизайн', name_he: 'עיצוב' }, { name: 'Math', name_he: null }]
  it('совпадение по name_he или name, без регистра и пробелов', () => {
    expect(isSubjectNameTaken(rows, [' עיצוב ', null])).toBe(true)
    expect(isSubjectNameTaken(rows, [null, 'math'])).toBe(true)
  })
  it('нет совпадения / пустые кандидаты → false', () => {
    expect(isSubjectNameTaken(rows, ['אחר', 'Other'])).toBe(false)
    expect(isSubjectNameTaken(rows, [null, '  '])).toBe(false)
  })
})

describe('buildContainerSemesterName', () => {
  it('маршрут · שנה <буква> · סמסטר N', () => {
    expect(buildContainerSemesterName('עיצוב גרפי', 1, 1)).toBe('עיצוב גרפי · שנה א · סמסטר 1')
    expect(buildContainerSemesterName('עיצוב גרפי', 2, 2)).toBe('עיצוב גרפי · שנה ב · סמסטר 2')
  })
  it('пустое имя маршрута пропускается', () => {
    expect(buildContainerSemesterName('  ', 3, 1)).toBe('שנה ג · סמסטר 1')
    expect(buildContainerSemesterName(null, 1, 2)).toBe('שנה א · סמסטר 2')
  })
  it('без года — «ללא שנה»', () => {
    expect(buildContainerSemesterName('X', null, 1)).toBe('X · ללא שנה · סמסטר 1')
  })
})

describe('pickOldestContainer', () => {
  it('пусто → null', () => {
    expect(pickOldestContainer([])).toBeNull()
  })
  it('самый ранний created_at', () => {
    const r = pickOldestContainer([
      { id: 'a', created_at: '2026-09-02T00:00:00Z' },
      { id: 'b', created_at: '2026-09-01T00:00:00Z' },
      { id: 'c', created_at: '2026-09-03T00:00:00Z' },
    ])
    expect(r?.id).toBe('b')
  })
  it('равные даты или их нет — по id', () => {
    expect(pickOldestContainer([
      { id: 'z', created_at: '2026-09-01T00:00:00Z' },
      { id: 'm', created_at: '2026-09-01T00:00:00Z' },
    ])?.id).toBe('m')
    expect(pickOldestContainer([{ id: 'q' }, { id: 'd', created_at: null }])?.id).toBe('d')
  })
  it('строки с датой раньше строк без даты', () => {
    expect(pickOldestContainer([
      { id: 'a', created_at: null },
      { id: 'b', created_at: '2026-09-05T00:00:00Z' },
    ])?.id).toBe('b')
  })
})
