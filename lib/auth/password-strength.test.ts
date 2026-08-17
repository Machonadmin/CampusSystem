import { describe, it, expect } from 'vitest'
import { passwordStrengthIssue } from './password'

describe('passwordStrengthIssue', () => {
  it('короткий пароль → too_short', () => {
    expect(passwordStrengthIssue('a1')).toBe('too_short')
    expect(passwordStrengthIssue('')).toBe('too_short')
    expect(passwordStrengthIssue('abc1234')).toBe('too_short') // 7 символов
  })

  it('только буквы или только цифры → need_letter_and_digit', () => {
    expect(passwordStrengthIssue('abcdefgh')).toBe('need_letter_and_digit')
    expect(passwordStrengthIssue('12345678')).toBe('need_letter_and_digit')
  })

  it('≥8 и буква и цифра → null (подходит)', () => {
    expect(passwordStrengthIssue('abcd1234')).toBeNull()
    expect(passwordStrengthIssue('MyPass99')).toBeNull()
  })
})
