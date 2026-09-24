import { describe, it, expect } from 'vitest'
import { admissionFunnel, pct, BEYOND_LEAD, BEYOND_APPLICANT } from './funnel'

describe('pct', () => {
  it('whole ≤ 0 → 0 (без деления на ноль)', () => {
    expect(pct(5, 0)).toBe(0)
    expect(pct(5, -1)).toBe(0)
  })
  it('один знак после запятой', () => {
    expect(pct(1, 3)).toBe(33.3)
    expect(pct(2, 3)).toBe(66.7)
    expect(pct(3, 3)).toBe(100)
  })
})

describe('BEYOND_* константы', () => {
  it('BEYOND_APPLICANT ⊂ BEYOND_LEAD, lead не входит', () => {
    for (const s of BEYOND_APPLICANT) expect(BEYOND_LEAD).toContain(s)
    expect(BEYOND_LEAD).not.toContain('lead' as never)
  })
})

describe('admissionFunnel', () => {
  it('пустой список → нули', () => {
    const r = admissionFunnel([])
    expect(r.by_status).toEqual({})
    expect(r.funnel).toEqual({ leads: 0, applicants: 0, students: 0, reached_applicant: 0, reached_student: 0 })
    expect(r.conversion).toEqual({ lead_to_applicant: 0, applicant_to_student: 0 })
  })

  it('кумулятивная воронка по срезу статусов', () => {
    const rows = [
      ...Array(6).fill({ education_status: 'lead' }),
      ...Array(2).fill({ education_status: 'applicant' }),
      ...Array(1).fill({ education_status: 'student' }),
      { education_status: 'graduated' },
      { education_status: 'lost' },
      { education_status: null },
    ]
    const r = admissionFunnel(rows)
    expect(r.by_status).toEqual({ lead: 6, applicant: 2, student: 1, graduated: 1, lost: 1, unknown: 1 })
    expect(r.funnel).toEqual({ leads: 6, applicants: 2, students: 1, reached_applicant: 4, reached_student: 2 })
    // 4 из (6+4)=10 → 40%; 2 из 4 → 50%
    expect(r.conversion).toEqual({ lead_to_applicant: 40, applicant_to_student: 50 })
  })
})
