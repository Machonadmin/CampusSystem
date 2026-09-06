import { describe, it, expect } from 'vitest'
import { evaluateCronAuth, cronAuthMessage } from './auth'

const SECRET = 'super-secret-cron-token-123'

describe('evaluateCronAuth — fail-closed', () => {
  it('верный секрет в Bearer → пропускаем', () => {
    expect(evaluateCronAuth(SECRET, `Bearer ${SECRET}`)).toEqual({ ok: true })
  })

  it('CRON_SECRET НЕ сконфигурирован → 503, задача НЕ выполняется (даже с заголовком)', () => {
    for (const configured of [undefined, null, '', '   ']) {
      expect(evaluateCronAuth(configured, `Bearer ${SECRET}`))
        .toEqual({ ok: false, status: 503, reason: 'not_configured' })
    }
  })

  it('не сконфигурирован И без заголовка → тоже 503 (а не «открыто»)', () => {
    expect(evaluateCronAuth(undefined, undefined))
      .toEqual({ ok: false, status: 503, reason: 'not_configured' })
  })

  it('неверный секрет → 401', () => {
    expect(evaluateCronAuth(SECRET, 'Bearer wrong-token'))
      .toEqual({ ok: false, status: 401, reason: 'unauthorized' })
  })

  it('отсутствующий заголовок → 401', () => {
    expect(evaluateCronAuth(SECRET, undefined)).toEqual({ ok: false, status: 401, reason: 'unauthorized' })
    expect(evaluateCronAuth(SECRET, null)).toEqual({ ok: false, status: 401, reason: 'unauthorized' })
    expect(evaluateCronAuth(SECRET, '')).toEqual({ ok: false, status: 401, reason: 'unauthorized' })
  })

  it('без схемы Bearer → 401 (голый секрет не принимается)', () => {
    expect(evaluateCronAuth(SECRET, SECRET)).toEqual({ ok: false, status: 401, reason: 'unauthorized' })
    expect(evaluateCronAuth(SECRET, `Basic ${SECRET}`)).toEqual({ ok: false, status: 401, reason: 'unauthorized' })
    expect(evaluateCronAuth(SECRET, `bearer ${SECRET}`)).toEqual({ ok: false, status: 401, reason: 'unauthorized' })
  })

  it('префикс/подстрока секрета не проходит', () => {
    expect(evaluateCronAuth(SECRET, `Bearer ${SECRET.slice(0, -1)}`).ok).toBe(false)
    expect(evaluateCronAuth(SECRET, `Bearer ${SECRET}extra`).ok).toBe(false)
  })

  it('лишние пробелы вокруг заголовка не ломают верный секрет', () => {
    expect(evaluateCronAuth(SECRET, `  Bearer ${SECRET}  `)).toEqual({ ok: true })
  })

  it('сообщения различают две причины', () => {
    expect(cronAuthMessage('not_configured')).toMatch(/CRON_SECRET/)
    expect(cronAuthMessage('unauthorized')).toBe('unauthorized')
  })
})
