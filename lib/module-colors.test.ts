import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isModuleImplemented, getModuleColor, getModuleHeaderGradient } from './module-colors'

describe('isModuleImplemented', () => {
  it('реализованные модули → true', () => {
    for (const m of ['persons', 'education', 'tasks', 'settings', 'staff', 'quality_control', 'alumni', 'finance', 'dormitory', 'food', 'maintenance', 'security', 'doctor', 'psychologist', 'reports', 'documents', 'contacts', 'sponsors', 'jewishness']) {
      expect(isModuleImplemented(m)).toBe(true)
    }
  })

  it('пока не реализованные модули → false', () => {
    expect(isModuleImplemented('applicants')).toBe(false)
    expect(isModuleImplemented('nonexistent')).toBe(false)
  })
})

describe('getModuleColor', () => {
  // Цвет модуля — токен темы, а не литеральный hex: у каждого модуля есть
  // светлый и тёмный вариант, и подставить их может только CSS.
  it('primary → var(--mod-X)', () => {
    expect(getModuleColor('education', 'primary')).toBe('var(--mod-education)')
    expect(getModuleColor('finance', 'primary')).toBe('var(--mod-finance)')
  })

  it('primary — значение по умолчанию', () => {
    expect(getModuleColor('education')).toBe('var(--mod-education)')
  })

  it('light → tint-токен (фон чипа, читаемый в обеих темах)', () => {
    expect(getModuleColor('education', 'light')).toBe('var(--mod-education-tint)')
  })

  it('medium → полупрозрачный primary (мягкая граница), а не отдельный токен', () => {
    expect(getModuleColor('education', 'medium'))
      .toBe('color-mix(in oklab, var(--mod-education) 55%, transparent)')
  })

  it('неизвестный модуль → нейтральный fallback-токен', () => {
    expect(getModuleColor('nope')).toBe('var(--mod-fallback)')
    expect(getModuleColor('nope', 'light')).toBe('var(--mod-fallback-tint)')
  })

  it('НЕ возвращает литеральный hex — иначе тема не переключится', () => {
    for (const m of ['education', 'finance', 'security', 'nope']) {
      for (const shade of ['primary', 'light', 'medium'] as const) {
        expect(getModuleColor(m, shade)).not.toMatch(/#[0-9a-fA-F]{6}/)
      }
    }
  })
})

describe('getModuleHeaderGradient', () => {
  it('строится из -banner (под белым текстом), а не из меняющегося -mod-X', () => {
    // На шапке лежит color:#fff (components/ui/ModuleHeader.tsx). Если бы фон
    // брался из --mod-X, в тёмной теме это была бы пастель → белое по светлому.
    const g = getModuleHeaderGradient('education')
    expect(g).toContain('var(--mod-education-banner)')
    expect(g).not.toContain('var(--mod-education)')
    expect(g).toMatch(/^linear-gradient\(140deg, /)
  })
})

/**
 * Регрессия на исходную жалобу владельца: несколько модулей выглядели
 * ОДИНАКОВО. До правки в палитре было три совпадения байт-в-байт
 * (food≡sponsors, alumni≡contacts, finance≡doctor) — ничто в коде это не
 * ловило. Здесь читаем реальные значения из globals.css и требуем, чтобы
 * идентичность каждого модуля была уникальной.
 */
describe('палитра модулей: без коллизий', () => {
  const css = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8')

  /** Собирает `--mod-<name>: #hex` из первого (светлого) блока :root. */
  function lightPalette(): Map<string, string> {
    const out = new Map<string, string>()
    const re = /--mod-([a-z_]+):\s*(#[0-9A-Fa-f]{6})/g
    let m: RegExpExecArray | null
    while ((m = re.exec(css))) {
      // Берём ТОЛЬКО первое вхождение имени = светлая тема (:root идёт первым).
      if (!out.has(m[1])) out.set(m[1], m[2].toUpperCase())
    }
    return out
  }

  it('в globals.css определены токены для всех модулей', () => {
    const p = lightPalette()
    for (const m of ['persons', 'education', 'finance', 'doctor', 'food', 'sponsors', 'alumni', 'contacts', 'security', 'tasks']) {
      expect(p.get(m), `нет токена --mod-${m}`).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('никакие два модуля не делят один цвет (кроме health≡doctor — один вход)', () => {
    const p = lightPalette()
    // health — объединённый вход «медпункт + психолог», намеренно = doctor.
    const ALLOWED_TWINS = new Set(['health'])
    const byColor = new Map<string, string[]>()
    for (const [mod, color] of p) {
      if (mod === 'fallback' || ALLOWED_TWINS.has(mod)) continue
      byColor.set(color, [...(byColor.get(color) ?? []), mod])
    }
    const collisions = [...byColor.entries()]
      .filter(([, mods]) => mods.length > 1)
      .map(([color, mods]) => `${color}: ${mods.join(' = ')}`)
    expect(collisions, `модули с одинаковым цветом:\n${collisions.join('\n')}`).toEqual([])
  })

  it('цвет модуля не совпадает с семантическими токенами состояния', () => {
    // Иначе модуль читается как СОСТОЯНИЕ (выбрано/ошибка/инфо), а не как раздел.
    // Ровно так было раньше: chavruta ≡ --accent, persons ≡ --info.
    const p = lightPalette()
    const stateTokens = ['#0d9488', '#2563eb', '#7c3aed', '#cc333f'] // accent, info, violet, danger
      .map(c => c.toUpperCase())
    const clashes: string[] = []
    for (const [mod, color] of p) {
      if (stateTokens.includes(color)) clashes.push(`${mod} = ${color}`)
    }
    expect(clashes, `цвет модуля равен токену состояния:\n${clashes.join('\n')}`).toEqual([])
  })
})
