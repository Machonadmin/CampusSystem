import { describe, it, expect } from 'vitest'
import { canSeeAbsence } from './absence-access'

describe('canSeeAbsence', () => {
  const row = (assigned: string | null) => ({ assigned_department_id: assigned, journey_id: 'j1' })
  it('scope=all — любой случай', () => {
    expect(canSeeAbsence({ all: true, deptManager: true, depts: [] }, row(null), null)).toBe(true)
  })
  it('случай передан моему подразделению', () => {
    expect(canSeeAbsence({ all: false, deptManager: false, depts: ['A'] }, row('A'), 'B')).toBe(true)
  })
  it('менеджер юнита — студентка его юнита', () => {
    expect(canSeeAbsence({ all: false, deptManager: true, depts: ['A'] }, row(null), 'A')).toBe(true)
  })
  it('менеджер юнита — чужая студентка, случай не передан ему → нет', () => {
    expect(canSeeAbsence({ all: false, deptManager: true, depts: ['A'] }, row('B'), 'B')).toBe(false)
  })
  it('не менеджер — подразделение студентки не даёт доступа', () => {
    expect(canSeeAbsence({ all: false, deptManager: false, depts: ['A'] }, row(null), 'A')).toBe(false)
  })
})
