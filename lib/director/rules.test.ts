import { describe, it, expect } from 'vitest'
import { directorSpaceRole, inboxHref, jewishnessStep, INBOX_CATEGORIES } from './rules'

describe('directorSpaceRole', () => {
  it('superadmin — המנהל', () => {
    expect(directorSpaceRole({ isSuperadmin: true, managedOwnerIds: [], superadminIds: [] })).toBe('director')
  })
  it('ведёт календарь superadmin — מזכירת המנהל', () => {
    expect(directorSpaceRole({ isSuperadmin: false, managedOwnerIds: ['boss'], superadminIds: ['boss'] })).toBe('secretary')
  })
  it('ведёт календарь не-superadmin — не входит', () => {
    expect(directorSpaceRole({ isSuperadmin: false, managedOwnerIds: ['head'], superadminIds: ['boss'] })).toBeNull()
  })
  it('никого не ведёт — не входит', () => {
    expect(directorSpaceRole({ isSuperadmin: false, managedOwnerIds: [], superadminIds: ['boss'] })).toBeNull()
  })
})

describe('jewishnessStep', () => {
  it('решено — не в очереди', () => {
    expect(jewishnessStep('verified', null)).toBeNull()
    expect(jewishnessStep('rejected', '2026-01-01')).toBeNull()
  })
  it('без первичной проверки — первая ступень (в т.ч. пустой/старый статус)', () => {
    expect(jewishnessStep('pending', null)).toBe('jewishness_initial')
    expect(jewishnessStep(null, null)).toBe('jewishness_initial')
    expect(jewishnessStep('needs_review', null)).toBe('jewishness_initial')
  })
  it('проверено равом — ждёт окончательного решения', () => {
    expect(jewishnessStep('pending', '2026-11-01T10:00:00Z')).toBe('jewishness_final')
  })
})

describe('inboxHref', () => {
  it('у каждой категории есть экран', () => {
    for (const c of INBOX_CATEGORIES) expect(inboxHref(c, { journey_id: 'j1' })).toMatch(/^\/dashboard\//)
  })
  it('платёж и יהדות ведут на карточку студентки', () => {
    expect(inboxHref('payment', { journey_id: 'j1' })).toBe('/dashboard/finance/j1')
    expect(inboxHref('jewishness_final', { journey_id: 'j1' })).toBe('/dashboard/education/leads/j1')
  })
})
