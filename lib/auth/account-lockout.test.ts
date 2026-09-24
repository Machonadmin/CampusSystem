import { describe, it, expect, vi, beforeEach } from 'vitest'

// Заглушка Supabase: select по колонкам и update с фиксацией записанного.
const { state } = vi.hoisted(() => ({
  state: {
    row: null as Record<string, unknown> | null,
    missingColumn: false,
    updates: [] as Array<{ table: string; patch: Record<string, unknown>; filter: [string, unknown] }>,
  },
}))

function query(table: string) {
  let cols = ''
  let patch: Record<string, unknown> | null = null
  const q = {
    select(c: string) { cols = c; return q },
    update(p: Record<string, unknown>) { patch = p; return q },
    eq(col: string, val: unknown) {
      if (patch) {
        if (state.missingColumn) return Promise.resolve({ error: { code: '42703', message: 'no column' } })
        state.updates.push({ table, patch, filter: [col, val] })
        return Promise.resolve({ error: null })
      }
      return q
    },
    maybeSingle() {
      if (state.missingColumn && cols.includes('failed_login_count')) {
        return Promise.resolve({ data: null, error: { code: '42703', message: 'no column' } })
      }
      return Promise.resolve({ data: state.row, error: null })
    },
  }
  return q
}

vi.mock('@/lib/supabase/server', () => ({ createServerClient: () => ({ from: (t: string) => query(t) }) }))

import {
  selectLoginRow, lockedForSec, nextFailureState, recordFailedLogin, recordSuccessfulLogin,
  clearLoginLockout, unknownLockedForSec, recordUnknownFailure, clearUnknownFailures,
  MAX_FAILED_LOGINS, LOCK_MINUTES,
} from './account-lockout'

beforeEach(() => {
  state.row = null
  state.missingColumn = false
  state.updates = []
  clearUnknownFailures()
})

describe('lockedForSec', () => {
  const now = Date.UTC(2026, 8, 24, 10, 0, 0)
  it('нет отметки или она в прошлом → 0', () => {
    expect(lockedForSec({})).toBe(0)
    expect(lockedForSec({ locked_until: new Date(now - 1000).toISOString() }, now)).toBe(0)
  })
  it('отметка в будущем → секунды до неё', () => {
    expect(lockedForSec({ locked_until: new Date(now + 90_500).toISOString() }, now)).toBe(91)
  })
})

describe('nextFailureState', () => {
  it('до порога — только растёт счётчик', () => {
    expect(nextFailureState({ failed_login_count: 3 })).toEqual({ failed_login_count: 4 })
    expect(nextFailureState({ failed_login_count: null })).toEqual({ failed_login_count: 1 })
  })
  it(`${MAX_FAILED_LOGINS}-я неудача подряд → блокировка на ${LOCK_MINUTES} минут и обнуление счётчика`, () => {
    const now = 1_000_000
    const s = nextFailureState({ failed_login_count: MAX_FAILED_LOGINS - 1 }, now)
    expect(s.failed_login_count).toBe(0)
    expect(Date.parse(s.locked_until!)).toBe(now + LOCK_MINUTES * 60_000)
  })
})

describe('selectLoginRow', () => {
  it('колонки есть → строка с полями блокировки', async () => {
    state.row = { person_id: 'p1', failed_login_count: 2, locked_until: null }
    const { row } = await selectLoginRow('person_accounts', 'person_id', 'a@x')
    expect(row).toEqual({ person_id: 'p1', failed_login_count: 2, locked_until: null })
  })
  it('до миграции → читает без них, вход не ломается', async () => {
    state.missingColumn = true
    state.row = { person_id: 'p1' }
    const { row, error } = await selectLoginRow('person_accounts', 'person_id', 'a@x')
    expect(error).toBeNull()
    expect(row).toEqual({ person_id: 'p1' })
  })
})

describe('запись неудач и успехов', () => {
  it('неудача пишет новый счётчик в строку по e-mail', async () => {
    await recordFailedLogin('person_accounts', 'a@x', { failed_login_count: 1, locked_until: null })
    expect(state.updates).toEqual([{ table: 'person_accounts', patch: { failed_login_count: 2 }, filter: ['login_email', 'a@x'] }])
  })
  it('до миграции (в строке нет колонок) — ничего не пишет', async () => {
    await recordFailedLogin('person_accounts', 'a@x', {})
    await recordSuccessfulLogin('person_accounts', 'a@x', {})
    expect(state.updates).toEqual([])
  })
  it('успешный вход обнуляет только если было что обнулять', async () => {
    await recordSuccessfulLogin('student_credentials', 's@x', { failed_login_count: 0, locked_until: null })
    expect(state.updates).toEqual([])
    await recordSuccessfulLogin('student_credentials', 's@x', { failed_login_count: 4, locked_until: null })
    expect(state.updates[0].patch).toEqual({ failed_login_count: 0, locked_until: null })
  })
  it('сброс пароля администратором снимает блокировку; до миграции — без ошибки', async () => {
    await clearLoginLockout('person_accounts', 'id', 'acc1')
    expect(state.updates[0]).toEqual({ table: 'person_accounts', patch: { failed_login_count: 0, locked_until: null }, filter: ['id', 'acc1'] })
    state.missingColumn = true
    await expect(clearLoginLockout('person_accounts', 'id', 'acc1')).resolves.toBeUndefined()
  })
})

describe('несуществующие адреса', () => {
  it(`после ${MAX_FAILED_LOGINS} неудач отвечают так же, как заблокированный аккаунт`, () => {
    const now = 5_000_000
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) recordUnknownFailure('staff:nobody@x', now)
    expect(unknownLockedForSec('staff:nobody@x', now)).toBe(0)
    recordUnknownFailure('staff:nobody@x', now)
    expect(unknownLockedForSec('staff:nobody@x', now)).toBe(LOCK_MINUTES * 60)
    expect(unknownLockedForSec('staff:nobody@x', now + LOCK_MINUTES * 60_000)).toBe(0)
  })
})
