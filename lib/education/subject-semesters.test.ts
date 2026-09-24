import { describe, it, expect } from 'vitest'
import { nextMissingTerm, pickSemesterPrice, isSubjectNameTaken, DEFAULT_SEMESTER_PRICE } from './subject-semesters'

describe('nextMissingTerm', () => {
  it('нет семестров → 1', () => {
    expect(nextMissingTerm([])).toBe(1)
  })
  it('1 и 2 заняты → 3', () => {
    expect(nextMissingTerm([1, 2])).toBe(3)
  })
  it('дыра в середине → наименьший свободный', () => {
    expect(nextMissingTerm([1, 3, 4])).toBe(2)
  })
  it('нет 1 → 1', () => {
    expect(nextMissingTerm([2, 3])).toBe(1)
  })
  it('null/0/дубли игнорируются', () => {
    expect(nextMissingTerm([null, undefined, 0, 1, 1, -2])).toBe(2)
  })
})

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
