import { describe, it, expect } from 'vitest'
import {
  extractStudentTag, withStudentTag, isAcceptanceTask, isUuid, studentDisplayName,
} from './student-tag'

const P = '11111111-2222-4333-8444-555555555555'
const J = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('isUuid', () => {
  it('принимает канонический UUID, отвергает прочее', () => {
    expect(isUuid(P)).toBe(true)
    expect(isUuid(P.toUpperCase())).toBe(true)
    expect(isUuid('')).toBe(false)
    expect(isUuid('p1')).toBe(false)
    expect(isUuid(`${P}x`)).toBe(false)
    expect(isUuid(null)).toBe(false)
    expect(isUuid(123)).toBe(false)
  })
})

describe('extractStudentTag', () => {
  it('пара UUID → метка (в нижнем регистре)', () => {
    expect(extractStudentTag({ student_person_id: P.toUpperCase(), journey_id: J })).toEqual({ student_person_id: P, journey_id: J })
  })
  it('нет пары / мусор → null', () => {
    expect(extractStudentTag({ student_person_id: P })).toBeNull()
    // автозадача приёмки: journey_id есть, student_person_id нет — это не метка
    expect(extractStudentTag({ source: 'acceptance', journey_id: J })).toBeNull()
    expect(extractStudentTag(null)).toBeNull()
    expect(extractStudentTag('x')).toBeNull()
    expect(extractStudentTag([P, J])).toBeNull()
  })
})

describe('withStudentTag', () => {
  it('ставит метку, не трогая прочие ключи', () => {
    expect(withStudentTag({ maintenance: true }, { student_person_id: P, journey_id: J }))
      .toEqual({ maintenance: true, student_person_id: P, journey_id: J })
  })
  it('снимает метку целиком', () => {
    expect(withStudentTag({ maintenance: true, student_person_id: P, journey_id: J }, null)).toEqual({ maintenance: true })
  })
  it('у автозадачи приёмки служебный journey_id при снятии сохраняется', () => {
    expect(withStudentTag({ source: 'acceptance', journey_id: J, student_person_id: P }, null))
      .toEqual({ source: 'acceptance', journey_id: J })
  })
  it('не мутирует вход', () => {
    const src = { a: 1 }
    withStudentTag(src, { student_person_id: P, journey_id: J })
    expect(src).toEqual({ a: 1 })
  })
})

describe('помощники', () => {
  it('isAcceptanceTask', () => {
    expect(isAcceptanceTask({ source: 'acceptance' })).toBe(true)
    expect(isAcceptanceTask({ source: 'x' })).toBe(false)
    expect(isAcceptanceTask(null)).toBe(false)
  })
  it('studentDisplayName: иврит, иначе полное имя', () => {
    expect(studentDisplayName({ full_name: 'Anna', hebrew_name: 'חנה' })).toBe('חנה')
    expect(studentDisplayName({ full_name: ' Anna ', hebrew_name: null })).toBe('Anna')
    expect(studentDisplayName(null)).toBe('')
  })
})
