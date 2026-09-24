import { describe, it, expect, vi, afterEach } from 'vitest'
import { rateLimit, clientIp } from './rate-limit'

// In-memory барьер против флуда публичной формы. Состояние — модульный Map,
// поэтому каждый тест берёт СВОЙ ключ (иначе тесты влияли бы друг на друга).
afterEach(() => vi.useRealTimers())

describe('rateLimit', () => {
  it('пропускает ровно `limit` запросов в окне, затем отказывает', () => {
    const key = 'k-basic'
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000).ok, `запрос ${i + 1}`).toBe(true)
    const denied = rateLimit(key, 3, 60_000)
    expect(denied.ok).toBe(false)
    expect(denied.retryAfterSec).toBeGreaterThan(0)
  })

  it('счётчики разных ключей независимы', () => {
    expect(rateLimit('k-a', 1, 60_000).ok).toBe(true)
    expect(rateLimit('k-a', 1, 60_000).ok).toBe(false)
    expect(rateLimit('k-b', 1, 60_000).ok).toBe(true)   // другой клиент не заблокирован
  })

  it('после истечения окна счётчик сбрасывается', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T10:00:00Z'))
    const key = 'k-window'
    expect(rateLimit(key, 1, 1000).ok).toBe(true)
    expect(rateLimit(key, 1, 1000).ok).toBe(false)
    vi.setSystemTime(new Date('2026-09-08T10:00:02Z'))  // окно прошло
    expect(rateLimit(key, 1, 1000).ok).toBe(true)
  })

  it('retryAfterSec округляется вверх и не превышает окно', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T10:00:00Z'))
    const key = 'k-retry'
    rateLimit(key, 1, 10_000)
    vi.setSystemTime(new Date('2026-09-08T10:00:04.500Z'))
    const r = rateLimit(key, 1, 10_000)
    expect(r.ok).toBe(false)
    expect(r.retryAfterSec).toBe(6)          // ceil(5.5s)
    expect(r.retryAfterSec).toBeLessThanOrEqual(10)
  })

  it('limit = 0 отказывает сразу на втором запросе (первый создаёт окно)', () => {
    const key = 'k-zero'
    expect(rateLimit(key, 0, 60_000).ok).toBe(true)
    expect(rateLimit(key, 0, 60_000).ok).toBe(false)
  })
})

describe('clientIp', () => {
  it('берёт первый адрес из x-forwarded-for', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' }))).toBe('203.0.113.7')
    expect(clientIp(new Headers({ 'x-forwarded-for': '  203.0.113.7  ' }))).toBe('203.0.113.7')
  })
  it('откатывается к x-real-ip, затем к "unknown"', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.5' }))).toBe('198.51.100.5')
    expect(clientIp(new Headers())).toBe('unknown')
  })
  it('x-forwarded-for имеет приоритет над x-real-ip', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2' }))).toBe('1.1.1.1')
  })
})
