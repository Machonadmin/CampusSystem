import { describe, it, expect } from 'vitest'
import {
  STUDENT_STATUSES,
  ACTIVE_STUDENT_STATUSES,
  isStudentStatus,
  isActiveStudentStatus,
} from './journey-status'

describe('isStudentStatus — учебный цикл', () => {
  it('true для всех статусов учебного цикла', () => {
    for (const s of STUDENT_STATUSES) expect(isStudentStatus(s)).toBe(true)
  })
  it('false для статусов до поступления', () => {
    expect(isStudentStatus('lead')).toBe(false)
    expect(isStudentStatus('applicant')).toBe(false)
  })
  it('false для пусто / null / undefined', () => {
    expect(isStudentStatus('')).toBe(false)
    expect(isStudentStatus(null)).toBe(false)
    expect(isStudentStatus(undefined)).toBe(false)
  })
})

describe('isActiveStudentStatus — аналог legacy students.status=active', () => {
  it("активна только 'student'", () => {
    expect(isActiveStudentStatus('student')).toBe(true)
    expect(ACTIVE_STUDENT_STATUSES).toEqual(['student'])
  })
  it('выпускница / отчислена / академ — НЕ активны', () => {
    expect(isActiveStudentStatus('graduated')).toBe(false)
    expect(isActiveStudentStatus('expelled')).toBe(false)
    expect(isActiveStudentStatus('on_leave')).toBe(false)
  })
  it('лид / абитуриентка — не активные студентки', () => {
    expect(isActiveStudentStatus('lead')).toBe(false)
    expect(isActiveStudentStatus('applicant')).toBe(false)
  })
  it('false для пусто / null / undefined', () => {
    expect(isActiveStudentStatus('')).toBe(false)
    expect(isActiveStudentStatus(null)).toBe(false)
    expect(isActiveStudentStatus(undefined)).toBe(false)
  })
  it('активные — подмножество учебного цикла', () => {
    for (const s of ACTIVE_STUDENT_STATUSES) expect(isStudentStatus(s)).toBe(true)
  })
})
