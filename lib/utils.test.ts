import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('склеивает классы через пробел', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('отбрасывает false/null/undefined (условные классы)', () => {
    expect(cn('a', false, 'b', null, undefined, 'c')).toBe('a b c')
  })

  it('пустой ввод → пустая строка', () => {
    expect(cn()).toBe('')
    expect(cn(false, null, undefined)).toBe('')
  })
})
