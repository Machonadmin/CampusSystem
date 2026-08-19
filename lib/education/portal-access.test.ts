import { describe, it, expect } from 'vitest'
import type { SessionPayload } from '@/lib/auth/jwt'
import { isOwnStudentJourney } from './portal-access'

// Workstream 2b: доказать, что студентка A НЕ видит journey студентки B.
// Self-gate чистый — тестируем без моков.

const studentA = { principal: 'student', student_journey_id: 'journey-A' } as SessionPayload
const studentB = { principal: 'student', student_journey_id: 'journey-B' } as SessionPayload
const staff = { principal: 'staff', roles: ['secretary'] } as unknown as SessionPayload

describe('isOwnStudentJourney — изоляция портала (A ≠ B)', () => {
  it('студентка A видит СВОЮ journey', () => {
    expect(isOwnStudentJourney(studentA, 'journey-A')).toBe(true)
  })

  it('студентка A НЕ видит journey студентки B (главный кейс бидуда)', () => {
    expect(isOwnStudentJourney(studentA, 'journey-B')).toBe(false)
  })

  it('студентка B НЕ видит journey студентки A', () => {
    expect(isOwnStudentJourney(studentB, 'journey-A')).toBe(false)
  })

  it('staff-сессия НЕ считается self-access (идёт через staff-гейты)', () => {
    expect(isOwnStudentJourney(staff, 'journey-A')).toBe(false)
  })

  it('нет сессии / нет journeyId → false', () => {
    expect(isOwnStudentJourney(null, 'journey-A')).toBe(false)
    expect(isOwnStudentJourney(undefined, 'journey-A')).toBe(false)
    expect(isOwnStudentJourney(studentA, null)).toBe(false)
    expect(isOwnStudentJourney(studentA, '')).toBe(false)
  })

  it('student без student_journey_id (битый токен) → false для любого id', () => {
    const broken = { principal: 'student' } as SessionPayload
    expect(isOwnStudentJourney(broken, 'journey-A')).toBe(false)
  })
})
