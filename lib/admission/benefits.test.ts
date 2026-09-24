import { describe, it, expect } from 'vitest'
import { parseBenefitsInput } from './benefits'

describe('parseBenefitsInput', () => {
  it('returns null for non-objects / empty', () => {
    expect(parseBenefitsInput(null)).toBeNull()
    expect(parseBenefitsInput(undefined)).toBeNull()
    expect(parseBenefitsInput('x')).toBeNull()
    expect(parseBenefitsInput({})).toBeNull()
    expect(parseBenefitsInput({ unrelated: 1 })).toBeNull()
  })

  it('parses a valid discount percent', () => {
    expect(parseBenefitsInput({ discount_percent: 50 })).toEqual({ discountPercent: 50 })
    expect(parseBenefitsInput({ discount_percent: '25' })).toEqual({ discountPercent: 25 })
    expect(parseBenefitsInput({ discount_percent: 0 })).toEqual({ discountPercent: 0 })
    expect(parseBenefitsInput({ discount_percent: 100 })).toEqual({ discountPercent: 100 })
  })

  it('ignores out-of-range discount but keeps other valid fields', () => {
    expect(parseBenefitsInput({ discount_percent: 150 })).toBeNull()
    expect(parseBenefitsInput({ discount_percent: -5 })).toBeNull()
    expect(parseBenefitsInput({ discount_percent: 200, support_amount: 300 })).toEqual({ supportAmount: 300 })
  })

  it('allows clearing a field with null/empty string', () => {
    expect(parseBenefitsInput({ discount_percent: null })).toEqual({ discountPercent: null })
    expect(parseBenefitsInput({ support_amount: '' })).toEqual({ supportAmount: null })
    expect(parseBenefitsInput({ benefits_notes: null })).toEqual({ benefitsNotes: null })
  })

  it('parses support amount >= 0', () => {
    expect(parseBenefitsInput({ support_amount: 1000 })).toEqual({ supportAmount: 1000 })
    expect(parseBenefitsInput({ support_amount: 0 })).toEqual({ supportAmount: 0 })
    expect(parseBenefitsInput({ support_amount: -1 })).toBeNull()
  })

  it('trims and caps notes; drops empty notes', () => {
    expect(parseBenefitsInput({ benefits_notes: '  hi  ' })).toEqual({ benefitsNotes: 'hi' })
    expect(parseBenefitsInput({ benefits_notes: '   ' })).toEqual({ benefitsNotes: null })
    const long = 'a'.repeat(3000)
    const out = parseBenefitsInput({ benefits_notes: long })
    expect(out?.benefitsNotes?.length).toBe(2000)
  })

  it('combines all three fields', () => {
    expect(parseBenefitsInput({ discount_percent: 30, support_amount: 500, benefits_notes: 'ok' }))
      .toEqual({ discountPercent: 30, supportAmount: 500, benefitsNotes: 'ok' })
  })

  it('ignores non-numeric junk', () => {
    expect(parseBenefitsInput({ discount_percent: 'abc' })).toBeNull()
    expect(parseBenefitsInput({ support_amount: {} })).toBeNull()
  })
})
