import { describe, it, expect } from 'vitest'
import { landingRouteForRoles, hasBroaderAdminRole } from './landing'

// По умолчанию каждый входит на общий главный экран /dashboard; управляющая
// кафедрой иудаики (kodeshWorkspace) — на дом иудаики; более широкий админ
// всегда остаётся на /dashboard.
describe('landingRouteForRoles', () => {
  it('без ctx: любая роль → /dashboard', () => {
    expect(landingRouteForRoles(['superadmin'])).toBe('/dashboard')
    expect(landingRouteForRoles(['campus_admin'])).toBe('/dashboard')
    expect(landingRouteForRoles(['teacher'])).toBe('/dashboard')
    expect(landingRouteForRoles(['recruiter'])).toBe('/dashboard')
    expect(landingRouteForRoles(['studies_manager'])).toBe('/dashboard')
    expect(landingRouteForRoles(['jewishness_officer'])).toBe('/dashboard')
    expect(landingRouteForRoles(['teacher', 'superadmin'])).toBe('/dashboard')
  })

  it('неизвестная роль / пусто / null → /dashboard', () => {
    expect(landingRouteForRoles(['unknown_role'])).toBe('/dashboard')
    expect(landingRouteForRoles([])).toBe('/dashboard')
    expect(landingRouteForRoles(null)).toBe('/dashboard')
    expect(landingRouteForRoles(undefined)).toBe('/dashboard')
  })

  it('управляющая кафедрой иудаики → дом иудаики', () => {
    expect(landingRouteForRoles([], { kodeshWorkspace: true }))
      .toBe('/dashboard/education/kodesh-home')
    expect(landingRouteForRoles(['jewishness_officer'], { kodeshWorkspace: true }))
      .toBe('/dashboard/education/kodesh-home')
  })

  it('более широкий админ остаётся на /dashboard даже с флагом kodesh', () => {
    expect(landingRouteForRoles(['superadmin'], { kodeshWorkspace: true })).toBe('/dashboard')
    expect(landingRouteForRoles(['campus_admin'], { kodeshWorkspace: true })).toBe('/dashboard')
    expect(landingRouteForRoles(['superadmin', 'kodesh_head'], { kodeshWorkspace: true })).toBe('/dashboard')
  })

  it('обычный пользователь без флага → /dashboard', () => {
    expect(landingRouteForRoles(['teacher'], { kodeshWorkspace: false })).toBe('/dashboard')
  })
})

describe('hasBroaderAdminRole', () => {
  it('true для superadmin/campus_admin', () => {
    expect(hasBroaderAdminRole(['superadmin'])).toBe(true)
    expect(hasBroaderAdminRole(['campus_admin'])).toBe(true)
    expect(hasBroaderAdminRole(['teacher', 'campus_admin'])).toBe(true)
  })
  it('false для прочих / пусто / null', () => {
    expect(hasBroaderAdminRole(['teacher'])).toBe(false)
    expect(hasBroaderAdminRole([])).toBe(false)
    expect(hasBroaderAdminRole(null)).toBe(false)
    expect(hasBroaderAdminRole(undefined)).toBe(false)
  })
})
