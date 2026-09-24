import { describe, it, expect } from 'vitest'
import { isReadOnlySession } from './jwt'

describe('isReadOnlySession', () => {
  it('обычная сессия сотрудника может менять данные', () => {
    expect(isReadOnlySession({})).toBe(false)
    expect(isReadOnlySession({ read_only: false })).toBe(false)
  })

  it('режим «צפייה כמשתמש» — только чтение', () => {
    expect(isReadOnlySession({ imp_by: 'admin-id' })).toBe(true)
  })

  it('служебный read-only аккаунт (тестовый вход для Claude) — только чтение', () => {
    expect(isReadOnlySession({ read_only: true })).toBe(true)
  })
})
