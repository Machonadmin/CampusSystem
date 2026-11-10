import { describe, expect, it } from 'vitest'
import { isValidSectionReturn, resolveSectionReturn } from './section-return'

describe('section-return', () => {
  it('accepts the section route with or without query', () => {
    expect(isValidSectionReturn('studies', '/dashboard/education/studies')).toBe(true)
    expect(isValidSectionReturn('studies', '/dashboard/education/studies?sec=dashboard')).toBe(true)
  })

  it('rejects other routes and junk', () => {
    expect(isValidSectionReturn('studies', '/dashboard/education/studies-x')).toBe(false)
    expect(isValidSectionReturn('studies', '/dashboard/education/recruitment')).toBe(false)
    expect(isValidSectionReturn('studies', 'https://evil.example/dashboard/education/studies')).toBe(false)
    expect(isValidSectionReturn('studies', null)).toBe(false)
  })

  it('falls back when nothing valid is stored', () => {
    expect(resolveSectionReturn('studies', '/dashboard/education/studies?sec=students', '/x')).toBe('/dashboard/education/studies?sec=students')
    expect(resolveSectionReturn('studies', '/dashboard/tasks', '/x')).toBe('/x')
    expect(resolveSectionReturn('studies', null, '/x')).toBe('/x')
  })
})
