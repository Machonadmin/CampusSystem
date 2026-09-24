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
/** CIEDE2000 — перцептивное расстояние. dE76 (простая евклидова в Lab)
 *  переоценивает разницу насыщенных цветов и пропускает реальные коллизии. */
function ciede2000(hexA: string, hexB: string): number {
  const toLab = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '')
    const srgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    const [r, g, b] = srgb.map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    const X = r * 0.4124 + g * 0.3576 + b * 0.1805
    const Y = r * 0.2126 + g * 0.7152 + b * 0.0722
    const Z = r * 0.0193 + g * 0.1192 + b * 0.9505
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
    const [fx, fy, fz] = [f(X / 0.95047), f(Y / 1), f(Z / 1.08883)]
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
  }
  const [L1, a1, b1] = toLab(hexA)
  const [L2, a2, b2] = toLab(hexB)
  const rad = (d: number) => (d * Math.PI) / 180
  const deg = (r: number) => (r * 180) / Math.PI
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2)
  const Cb = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)) || 0)
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2)
  const h1 = (deg(Math.atan2(b1, a1p)) + 360) % 360
  const h2 = (deg(Math.atan2(b2, a2p)) + 360) % 360
  const dLp = L2 - L1, dCp = C2p - C1p
  let dhp = 0
  if (C1p * C2p !== 0) {
    dhp = h2 - h1
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp) / 2)
  const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2
  let hbp = h1 + h2
  if (C1p * C2p !== 0) {
    if (Math.abs(h1 - h2) <= 180) hbp = (h1 + h2) / 2
    else hbp = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2
  }
  const T = 1 - 0.17 * Math.cos(rad(hbp - 30)) + 0.24 * Math.cos(rad(2 * hbp))
    + 0.32 * Math.cos(rad(3 * hbp + 6)) - 0.2 * Math.cos(rad(4 * hbp - 63))
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2)
  const Sc = 1 + 0.045 * Cbp
  const Sh = 1 + 0.015 * Cbp * T
  const Rt = -2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
    * Math.sin(rad(60 * Math.exp(-(((hbp - 275) / 25) ** 2))))
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2
    + Rt * (dCp / Sc) * (dHp / Sh))
}

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

  /**
   * Байт-в-байт совпадений мало: цвета могут различаться числами и всё равно
   * выглядеть одинаково. Первый заход на эту палитру был «проверен» простой
   * евклидовой метрикой (dE76) и показал 16-18 — на глаз приличные значения.
   * По CIEDE2000, которая соответствует восприятию, те же пары давали 6.6:
   * admission практически совпадал с reports. Поэтому порог считаем ТОЛЬКО
   * по CIEDE2000 и ТОЛЬКО между разными модулями (шаги одного конвейера
   * набор→приём→учёба намеренно похожи — это одна семья).
   */
  it('разные модули различимы по CIEDE2000 (>= 12)', () => {
    const p = lightPalette()
    const FAMILY = new Set(['recruitment', 'admission', 'education'])
    const TWINS = new Set([
      'health',    // объединённый вход «медпункт+психолог» = doctor, намеренно
      'dashboard', // не плитка модуля, а хром: приветственный баннер главной.
                   // Рядом с плитками не появляется, сравнивать не с чем.
    ])
    const close: string[] = []
    const names = [...p.keys()].filter(m => m !== 'fallback' && !TWINS.has(m))
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const [a, b] = [names[i], names[j]]
        if (FAMILY.has(a) && FAMILY.has(b)) continue // одна семья — см. коммент
        const d = ciede2000(p.get(a)!, p.get(b)!)
        if (d < 12) close.push(`${a} vs ${b}: dE2000 ${d.toFixed(1)}`)
      }
    }
    expect(close, `модули слишком похожи по восприятию:\n${close.join('\n')}`).toEqual([])
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
