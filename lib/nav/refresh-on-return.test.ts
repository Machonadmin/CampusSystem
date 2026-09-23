import { describe, it, expect } from 'vitest'
import { markRefreshOnReturn, consumeRefreshOnReturn } from './refresh-on-return'

function memStore() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
  }
}

describe('refresh-on-return', () => {
  it('marked path is consumed exactly once', () => {
    const s = memStore()
    markRefreshOnReturn('/dashboard/education/leads/1', s)
    expect(consumeRefreshOnReturn('/dashboard/education/leads/1', s)).toBe(true)
    expect(consumeRefreshOnReturn('/dashboard/education/leads/1', s)).toBe(false)
  })

  it('another path does not consume the mark', () => {
    const s = memStore()
    markRefreshOnReturn('/dashboard/education/leads/1', s)
    expect(consumeRefreshOnReturn('/dashboard/education/leads/2', s)).toBe(false)
    expect(consumeRefreshOnReturn('/dashboard/education/leads/1', s)).toBe(true)
  })

  it('no storage (SSR / private mode) → no-op, never throws', () => {
    expect(() => markRefreshOnReturn('/x', null)).not.toThrow()
    expect(consumeRefreshOnReturn('/x', null)).toBe(false)
    const broken = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
      removeItem: () => { throw new Error('denied') },
    }
    expect(() => markRefreshOnReturn('/x', broken)).not.toThrow()
    expect(consumeRefreshOnReturn('/x', broken)).toBe(false)
  })
})
