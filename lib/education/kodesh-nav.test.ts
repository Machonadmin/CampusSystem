import { describe, it, expect } from 'vitest'
import { kodeshNavItemVisibility } from './kodesh-nav'

const ALL_TRUE = {
  viewStudents: true,
  manageClassGroups: true,
  kodesh: true,
  jewishness: true,
  contacts: true,
}

describe('kodeshNavItemVisibility — fail-closed §10 gating', () => {
  it('все права → все пункты видимы', () => {
    const v = kodeshNavItemVisibility(ALL_TRUE)
    for (const key of ['home', 'prep', 'alerts', 'calendar', 'courses', 'teachers', 'students', 'jewishness', 'contacts']) {
      expect(v[key]).toBe(true)
    }
  })

  it('«дом» виден ВСЕГДА, даже без единого права', () => {
    const v = kodeshNavItemVisibility({
      viewStudents: false, manageClassGroups: false, kodesh: false, jewishness: false, contacts: false,
    })
    expect(v.home).toBe(true)
  })

  it('нет view_students → скрыты alerts/teachers/students, остальное не задето', () => {
    const v = kodeshNavItemVisibility({ ...ALL_TRUE, viewStudents: false })
    expect(v.alerts).toBe(false)
    expect(v.teachers).toBe(false)
    expect(v.students).toBe(false)
    expect(v.courses).toBe(true) // управляется kodesh, не задет
  })

  it('нет управления кодешем → скрыты prep и courses', () => {
    const v = kodeshNavItemVisibility({ ...ALL_TRUE, kodesh: false })
    expect(v.prep).toBe(false)
    expect(v.courses).toBe(false)
  })

  it('нет manage_class_groups → скрыт calendar', () => {
    expect(kodeshNavItemVisibility({ ...ALL_TRUE, manageClassGroups: false }).calendar).toBe(false)
  })

  it('jewishness / contacts гейтятся своим правом', () => {
    expect(kodeshNavItemVisibility({ ...ALL_TRUE, jewishness: false }).jewishness).toBe(false)
    expect(kodeshNavItemVisibility({ ...ALL_TRUE, contacts: false }).contacts).toBe(false)
  })
})
