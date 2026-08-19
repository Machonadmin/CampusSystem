import { describe, it, expect } from 'vitest'
import { landingRouteForRoles } from './landing'

// Владелец: каждый пользователь после входа попадает на общий главный экран
// /dashboard (посадка по роли на отдельный экран убрана).
describe('landingRouteForRoles — всегда главный экран', () => {
  it('любая роль → /dashboard', () => {
    expect(landingRouteForRoles(['superadmin'])).toBe('/dashboard')
    expect(landingRouteForRoles(['campus_admin'])).toBe('/dashboard')
    expect(landingRouteForRoles(['teacher'])).toBe('/dashboard')
    expect(landingRouteForRoles(['recruiter'])).toBe('/dashboard')
    expect(landingRouteForRoles(['studies_manager'])).toBe('/dashboard')
    expect(landingRouteForRoles(['campus_doctor'])).toBe('/dashboard')
    expect(landingRouteForRoles(['jewishness_officer'])).toBe('/dashboard')
    expect(landingRouteForRoles(['kitchen'])).toBe('/dashboard')
    expect(landingRouteForRoles(['teacher', 'superadmin'])).toBe('/dashboard')
  })

  it('неизвестная роль / пусто / null → /dashboard', () => {
    expect(landingRouteForRoles(['unknown_role'])).toBe('/dashboard')
    expect(landingRouteForRoles([])).toBe('/dashboard')
    expect(landingRouteForRoles(null)).toBe('/dashboard')
    expect(landingRouteForRoles(undefined)).toBe('/dashboard')
  })
})
