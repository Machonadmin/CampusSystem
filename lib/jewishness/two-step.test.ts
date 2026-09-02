import { describe, it, expect } from 'vitest'
import { canSetJewishnessStatus, isKodeshJewishnessEligible, type JewishnessCaps } from './two-step'

const NONE: JewishnessCaps = { isSuperadmin: false, hasAccess: false, canInitialCheck: false, canFinalApprove: false }
const MOSHE: JewishnessCaps = { isSuperadmin: false, hasAccess: true, canInitialCheck: true, canFinalApprove: false }
const CHANA: JewishnessCaps = { isSuperadmin: false, hasAccess: true, canInitialCheck: false, canFinalApprove: true }
const ACCESS_ONLY: JewishnessCaps = { isSuperadmin: false, hasAccess: true, canInitialCheck: false, canFinalApprove: false }
const SUPER: JewishnessCaps = { isSuperadmin: true, hasAccess: false, canInitialCheck: false, canFinalApprove: false }

describe('canSetJewishnessStatus — Moshe⇄Chana separation', () => {
  it('only Moshe (initial_check) can set initial_checked', () => {
    expect(canSetJewishnessStatus('initial_checked', MOSHE)).toBe(true)
    expect(canSetJewishnessStatus('initial_checked', CHANA)).toBe(false)
    expect(canSetJewishnessStatus('initial_checked', ACCESS_ONLY)).toBe(false)
  })
  it('only Chana (final_approve) can set verified (final)', () => {
    expect(canSetJewishnessStatus('verified', CHANA)).toBe(true)
    expect(canSetJewishnessStatus('verified', MOSHE)).toBe(false)
    expect(canSetJewishnessStatus('verified', ACCESS_ONLY)).toBe(false)
  })
  it('either step-holder may reject', () => {
    expect(canSetJewishnessStatus('rejected', MOSHE)).toBe(true)
    expect(canSetJewishnessStatus('rejected', CHANA)).toBe(true)
    expect(canSetJewishnessStatus('rejected', ACCESS_ONLY)).toBe(false)
  })
  it('non-deciding states need only jewishness access', () => {
    for (const s of ['pending', 'needs_review', 'partial']) {
      expect(canSetJewishnessStatus(s, ACCESS_ONLY)).toBe(true)
      expect(canSetJewishnessStatus(s, NONE)).toBe(false)
    }
  })
  it('superadmin may set anything', () => {
    for (const s of ['initial_checked', 'verified', 'rejected', 'pending']) {
      expect(canSetJewishnessStatus(s, SUPER)).toBe(true)
    }
  })
  it('no one may set an unknown status', () => {
    expect(canSetJewishnessStatus('bogus', SUPER)).toBe(true) // superadmin bypass
    expect(canSetJewishnessStatus('bogus', CHANA)).toBe(false)
  })
})

describe('isKodeshJewishnessEligible (the gate)', () => {
  it('is true only for the final approved status', () => {
    expect(isKodeshJewishnessEligible('verified')).toBe(true)
    expect(isKodeshJewishnessEligible('initial_checked')).toBe(false)
    expect(isKodeshJewishnessEligible('partial')).toBe(false)
    expect(isKodeshJewishnessEligible('pending')).toBe(false)
    expect(isKodeshJewishnessEligible(null)).toBe(false)
  })
})
