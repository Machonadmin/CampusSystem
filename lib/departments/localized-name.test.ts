import { describe, it, expect } from 'vitest'
import { localizedDeptName } from './localized-name'

describe('localizedDeptName', () => {
  const d = { name: 'Колледж', name_he: 'קולג׳', name_en: 'College' }
  it('ru → русское name (по умолчанию)', () => expect(localizedDeptName(d, 'ru')).toBe('Колледж'))
  it('he → name_he', () => expect(localizedDeptName(d, 'he')).toBe('קולג׳'))
  it('en → name_en', () => expect(localizedDeptName(d, 'en')).toBe('College'))
  it('he без перевода → откат к русскому', () => expect(localizedDeptName({ name: 'Общежитие' }, 'he')).toBe('Общежитие'))
  it('пустой перевод → откат к русскому', () => expect(localizedDeptName({ name: 'Школа', name_he: '  ' }, 'he')).toBe('Школа'))
})
