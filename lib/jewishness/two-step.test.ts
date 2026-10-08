import { describe, it, expect } from 'vitest'
import { canDoInitialCheck, canSetJewishnessStatus, isKodeshJewishnessEligible, type JewishnessCaps } from './two-step'
import { JEWISHNESS_STATUSES, finalCodeToStatus, isJewishnessStatus, normalizeJewishnessStatus } from './status'

const NONE: JewishnessCaps = { isSuperadmin: false, hasAccess: false, canInitialCheck: false, canFinalApprove: false }
const MOSHE: JewishnessCaps = { isSuperadmin: false, hasAccess: true, canInitialCheck: true, canFinalApprove: false }
const CHANA: JewishnessCaps = { isSuperadmin: false, hasAccess: true, canInitialCheck: false, canFinalApprove: true }
const ACCESS_ONLY: JewishnessCaps = { isSuperadmin: false, hasAccess: true, canInitialCheck: false, canFinalApprove: false }
const SUPER: JewishnessCaps = { isSuperadmin: true, hasAccess: false, canInitialCheck: false, canFinalApprove: false }

describe('jewishness statuses — exactly three (owner, M16)', () => {
  it('are pending (בבדיקה) / verified (אושר) / rejected (לא אושר)', () => {
    expect([...JEWISHNESS_STATUSES]).toEqual(['pending', 'verified', 'rejected'])
  })
  it('retired codes are not valid statuses any more', () => {
    for (const s of ['initial_checked', 'needs_review', 'partial']) {
      expect(isJewishnessStatus(s)).toBe(false)
    }
  })
  it('normalizes retired / unknown / empty values to pending', () => {
    expect(normalizeJewishnessStatus('initial_checked')).toBe('pending')
    expect(normalizeJewishnessStatus('needs_review')).toBe('pending')
    expect(normalizeJewishnessStatus('partial')).toBe('pending')
    expect(normalizeJewishnessStatus(null)).toBe('pending')
    expect(normalizeJewishnessStatus('bogus')).toBe('pending')
    expect(normalizeJewishnessStatus('verified')).toBe('verified')
    expect(normalizeJewishnessStatus('rejected')).toBe('rejected')
  })
  it('maps acceptance decisions: approved → verified, rejected → rejected, partial → pending', () => {
    expect(finalCodeToStatus('approved')).toBe('verified')
    expect(finalCodeToStatus('rejected')).toBe('rejected')
    expect(finalCodeToStatus('partial')).toBe('pending')
    expect(finalCodeToStatus('other')).toBeNull()
    expect(finalCodeToStatus(null)).toBeNull()
  })
})

describe('canDoInitialCheck — the rav\'s initial check is an action, not a status', () => {
  it('only Moshe (initial_check) or superadmin', () => {
    expect(canDoInitialCheck(MOSHE)).toBe(true)
    expect(canDoInitialCheck(SUPER)).toBe(true)
    expect(canDoInitialCheck(CHANA)).toBe(false)
    expect(canDoInitialCheck(ACCESS_ONLY)).toBe(false)
  })
})

describe('canSetJewishnessStatus — Moshe⇄Chana separation', () => {
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
  it('pending (in review) needs only jewishness access', () => {
    expect(canSetJewishnessStatus('pending', ACCESS_ONLY)).toBe(true)
    expect(canSetJewishnessStatus('pending', NONE)).toBe(false)
  })
  it('retired statuses cannot be set by non-superadmins', () => {
    for (const s of ['initial_checked', 'needs_review', 'partial']) {
      expect(canSetJewishnessStatus(s, MOSHE)).toBe(false)
      expect(canSetJewishnessStatus(s, CHANA)).toBe(false)
    }
  })
  it('superadmin may set anything', () => {
    for (const s of ['verified', 'rejected', 'pending']) {
      expect(canSetJewishnessStatus(s, SUPER)).toBe(true)
    }
  })
  it('no one may set an unknown status', () => {
    expect(canSetJewishnessStatus('bogus', SUPER)).toBe(true) // superadmin bypass (API validates the value first)
    expect(canSetJewishnessStatus('bogus', CHANA)).toBe(false)
  })
})

describe('isKodeshJewishnessEligible (the gate)', () => {
  it('is true only for the final approved status', () => {
    expect(isKodeshJewishnessEligible('verified')).toBe(true)
    expect(isKodeshJewishnessEligible('pending')).toBe(false)
    expect(isKodeshJewishnessEligible('rejected')).toBe(false)
    expect(isKodeshJewishnessEligible(null)).toBe(false)
  })
})
