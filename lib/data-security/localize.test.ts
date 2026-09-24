import { describe, it, expect } from 'vitest'
import { pickLang, hasAnyText } from './localize'

describe('pickLang', () => {
  const full = { he: 'עברית', ru: 'русский', en: 'english' }

  it('берёт язык пользователя, когда он есть', () => {
    expect(pickLang('he', full)).toBe('עברית')
    expect(pickLang('ru', full)).toBe('русский')
    expect(pickLang('en', full)).toBe('english')
  })

  it('откатывается на иврит раньше русского: интерфейс учреждения ивритский', () => {
    expect(pickLang('ru', { he: 'עברית', ru: null, en: 'english' })).toBe('עברית')
    expect(pickLang('en', { he: 'עברית', ru: 'русский', en: null })).toBe('עברית')
  })

  it('пустая строка и пробелы — это не перевод', () => {
    expect(pickLang('ru', { he: 'עברית', ru: '   ', en: null })).toBe('עברית')
    expect(pickLang('ru', { he: null, ru: '', en: null })).toBeNull()
  })

  it('подрезает пробелы по краям', () => {
    expect(pickLang('he', { he: '  שלום  ', ru: null, en: null })).toBe('שלום')
  })

  it('без единого перевода возвращает null — чтобы экран показал «нет подписи», а не код', () => {
    expect(pickLang('he', { he: null, ru: null, en: null })).toBeNull()
    expect(hasAnyText({ he: null, ru: null, en: null })).toBe(false)
    expect(hasAnyText({ he: null, ru: 'есть', en: null })).toBe(true)
  })
})
