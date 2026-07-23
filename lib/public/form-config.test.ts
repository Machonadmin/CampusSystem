import { describe, it, expect } from 'vitest'
import { normalizeConfig, BUILTIN_FIELDS, DEFAULT_CONFIG } from './form-config'

describe('normalizeConfig', () => {
  it('пустой/битый вход → дефолт (форма как раньше)', () => {
    expect(normalizeConfig(null)).toEqual(DEFAULT_CONFIG)
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG)
    expect(normalizeConfig('garbage')).toEqual(DEFAULT_CONFIG)
    expect(normalizeConfig(42)).toEqual(DEFAULT_CONFIG)
  })

  it('всегда содержит ВСЕ встроенные поля (недостающие — из дефолта)', () => {
    const cfg = normalizeConfig({ fields: [{ key: 'email', visible: false, required: true }] })
    expect(cfg.fields.map(f => f.key).sort()).toEqual([...BUILTIN_FIELDS].sort())
    expect(cfg.fields.find(f => f.key === 'email')).toEqual({ key: 'email', visible: false, required: true })
    // остальные — дефолт
    expect(cfg.fields.find(f => f.key === 'city')).toEqual({ key: 'city', visible: true, required: false })
  })

  it('неизвестные ключи полей отбрасываются', () => {
    const cfg = normalizeConfig({ fields: [{ key: 'ssn', visible: true, required: true }] })
    expect(cfg.fields.some(f => (f.key as string) === 'ssn')).toBe(false)
  })

  it('санитизирует кастомные поля (тип, опции, ключ, флаги)', () => {
    const cfg = normalizeConfig({
      customFields: [
        { type: 'weird', label: { he: 'שאלה' }, options: ['a', '', 'b', 3], required: true },
        { key: 'c9', type: 'select', options: ['x'] },
      ],
    })
    expect(cfg.customFields[0].type).toBe('text')          // неизвестный тип → text
    expect(cfg.customFields[0].key).toBe('c1')             // сгенерирован
    expect(cfg.customFields[0].label).toEqual({ he: 'שאלה', ru: '', en: '' })
    expect(cfg.customFields[0].options).toEqual(['a', 'b']) // пустые/не-строки убраны
    expect(cfg.customFields[0].visible).toBe(true)         // по умолчанию видимо
    expect(cfg.customFields[1].key).toBe('c9')
    expect(cfg.customFields[1].type).toBe('select')
  })

  it('directions: subset с ids, иначе all', () => {
    expect(normalizeConfig({ directions: { mode: 'subset', ids: ['a', '', 'b'] } }).directions)
      .toEqual({ mode: 'subset', ids: ['a', 'b'] })
    expect(normalizeConfig({ directions: { mode: 'nonsense' } }).directions)
      .toEqual({ mode: 'all', ids: [] })
  })

  it('texts: пустые значения и языки отбрасываются, непустые сохраняются', () => {
    const cfg = normalizeConfig({
      texts: { he: { hero_tagline: '  שלום  ', register_heading: '   ' }, en: {} },
    })
    expect(cfg.texts).toEqual({ he: { hero_tagline: 'שלום' } })
  })
})
