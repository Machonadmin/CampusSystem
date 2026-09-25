import { describe, it, expect } from 'vitest'
import { journeyTarget, journeyScopeDepartment } from './journey-target'

// Права на одну journey проверяются по тому же подразделению, по которому её
// показывает список: студентка — primary, лид/абитуриентка — desired.
describe('journeyScopeDepartment', () => {
  it('студентка → primary_department_id', () => {
    expect(journeyScopeDepartment({ education_status: 'student', primary_department_id: 'P', desired_department_id: 'D' })).toBe('P')
    expect(journeyScopeDepartment({ education_status: 'graduated', primary_department_id: 'P', desired_department_id: null })).toBe('P')
  })

  it('лид и абитуриентка → desired_department_id', () => {
    expect(journeyScopeDepartment({ education_status: 'lead', primary_department_id: null, desired_department_id: 'D' })).toBe('D')
    expect(journeyScopeDepartment({ education_status: 'applicant', primary_department_id: 'P', desired_department_id: 'D' })).toBe('D')
  })

  it('лид без desired → primary, если он есть', () => {
    expect(journeyScopeDepartment({ education_status: 'applicant', primary_department_id: 'P', desired_department_id: null })).toBe('P')
  })

  it('подразделения нет вовсе → null', () => {
    expect(journeyScopeDepartment({ education_status: 'lead', primary_department_id: null, desired_department_id: null })).toBeNull()
  })
})

describe('journeyTarget (объект без подразделения)', () => {
  it('есть подразделение → department_id', () => {
    expect(journeyTarget({ education_status: 'student', primary_department_id: 'P' })).toEqual({ department_id: 'P' })
  })
  it('лид без подразделения → общий пул ({})', () => {
    expect(journeyTarget({ education_status: 'lead', primary_department_id: null, desired_department_id: null })).toEqual({})
  })
  it('абитуриентка без подразделения → unassigned', () => {
    expect(journeyTarget({ education_status: 'applicant', primary_department_id: null, desired_department_id: null })).toEqual({ unassigned: true })
  })
  it('студентка без подразделения → unassigned', () => {
    expect(journeyTarget({ education_status: 'student', primary_department_id: null, desired_department_id: 'D' })).toEqual({ unassigned: true })
  })
})
