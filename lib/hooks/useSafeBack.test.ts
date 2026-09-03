import { describe, it, expect } from 'vitest'
import { resolveBackTarget } from './useSafeBack'

describe('resolveBackTarget', () => {
  it('uses real browser back when there is in-app history', () => {
    expect(resolveBackTarget({ canGoBack: true, fallback: '/dashboard/education' })).toEqual({ action: 'back' })
  })

  it('falls back to the sensible parent (not home) when there is no history', () => {
    expect(resolveBackTarget({ canGoBack: false, fallback: '/dashboard/education' })).toEqual({
      action: 'push',
      href: '/dashboard/education',
    })
  })

  it('never routes to home unless home is the explicit fallback', () => {
    const d = resolveBackTarget({ canGoBack: false, fallback: '/dashboard/finance' })
    expect(d.action).toBe('push')
    expect(d.href).toBe('/dashboard/finance')
    expect(d.href).not.toBe('/dashboard')
  })
})
