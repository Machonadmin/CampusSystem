import { describe, it, expect } from 'vitest'
import {
  directorSpaceRole, inboxActions, inboxHref, isActiveGrant, isSecretaryGrantCategory, jewishnessStep,
  INBOX_CATEGORIES, SECRETARY_GRANTS,
} from './rules'

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


describe('inboxActions — те же маршруты, что у исходных экранов', () => {
  it('час в расписании', () => {
    const a = inboxActions({ category: 'schedule_slot', id: 's1' })
    expect(a.approve).toEqual({ url: '/api/education/schedule/slots/s1/decision', method: 'POST', body: { decision: 'approve' } })
    expect(a.reject?.body).toEqual({ decision: 'reject' })
  })
  it('скидка', () => {
    const a = inboxActions({ category: 'discount', id: 'd1' })
    expect(a.approve).toEqual({ url: '/api/finance/discount-approvals/d1', method: 'PATCH', body: { status: 'approved' } })
    expect(a.reject?.body).toEqual({ status: 'rejected' })
  })
  it('платёж — только подтвердить', () => {
    const a = inboxActions({ category: 'payment', id: 'p1' })
    expect(a.approve?.url).toBe('/api/finance/payments/p1/approve')
    expect(a.reject).toBeNull()
  })
  it('נוכחות מורה: реальная отметка и виртуальная заявка', () => {
    expect(inboxActions({ category: 'teacher_attendance', id: 't1' }).approve)
      .toEqual({ url: '/api/education/teacher-attendance/t1', method: 'PATCH', body: { decision: 'approved' } })
    const v = inboxActions({ category: 'teacher_attendance', id: 'virtual:l1:p1', virtual: true, lesson_id: 'l1', teacher_person_id: 'p1' })
    expect(v.reject).toEqual({
      url: '/api/education/teacher-attendance/from-attendance', method: 'POST',
      body: { lesson_id: 'l1', teacher_person_id: 'p1', decision: 'rejected' },
    })
  })
  it('встреча — только отклонить (утвердить = выбрать время на экране פגישות)', () => {
    const a = inboxActions({ category: 'meeting_request', id: 'r1' })
    expect(a.approve).toBeNull()
    expect(a.reject).toEqual({ url: '/api/meetings/requests/r1', method: 'PATCH', body: { action: 'decline' } })
  })
  it('без кнопок: преподаватель на курс и יהדות', () => {
    for (const c of ['teacher_course', 'jewishness_initial', 'jewishness_final'] as const) {
      expect(inboxActions({ category: c, id: 'x' })).toEqual({ approve: null, reject: null })
    }
  })
})


describe('SECRETARY_GRANTS — только узкие права (решение «הרשאות צרות»)', () => {
  it('категория → узкое право', () => {
    expect(SECRETARY_GRANTS).toEqual({
      schedule_slot: { module: 'studies', privilege_code: 'approve_schedule_slots' },
      discount: { module: 'finance', privilege_code: 'approve_discount' },
      payment: { module: 'finance', privilege_code: 'confirm_payment' },
      teacher_attendance: { module: 'studies', privilege_code: 'approve_teacher_attendance' },
    })
  })
  it('широкие права переключатель не выдаёт никогда', () => {
    const codes = Object.values(SECRETARY_GRANTS).map(g => g.privilege_code)
    expect(codes).not.toContain('approve_payment')
    expect(codes).not.toContain('manage_students')
  })
  it('isSecretaryGrantCategory', () => {
    expect(isSecretaryGrantCategory('payment')).toBe(true)
    expect(isSecretaryGrantCategory('meeting_request')).toBe(false)
    expect(isSecretaryGrantCategory('toString')).toBe(false)
  })
  it('isActiveGrant: запрет и истёкший срок — не выдано', () => {
    const now = '2026-11-24T12:00:00Z'
    expect(isActiveGrant({ is_granted: true, expires_at: null }, now)).toBe(true)
    expect(isActiveGrant({ is_granted: false, expires_at: null }, now)).toBe(false)
    expect(isActiveGrant({ is_granted: true, expires_at: '2026-11-01T00:00:00Z' }, now)).toBe(false)
  })
})
