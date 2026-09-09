import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Страж фундамента дизайн-системы.
 *
 * ЗАЧЕМ. Шкалы (радиусы, отступы, кегли, насыщенности, слои) и примитивы
 * Button/Badge существуют ровно для того, чтобы новые «магические числа» и
 * литеральные цвета больше не расползались по экранам. Ни компилятор, ни
 * линтер этого не ловят: `borderRadius: 9` и `color: '#fff'` — валидный код.
 * Поэтому проверка статическая: читаем исходники и требуем, чтобы
 *   1) в globals.css были объявлены ВСЕ ступени шкал (иначе var(--…) в
 *      примитивах молча схлопнется в «нет значения» и кнопка поедет);
 *   2) в Button.tsx и Badge.tsx не было ни одного литерального hex — иначе
 *      примитив перестанет переключаться вместе с темой, а это ровно та
 *      болезнь, из-за которой чипы были нечитаемы в тёмной теме.
 *
 * Тест ничего не рендерит (как lib/api/route-authorization.test.ts и
 * статическая часть lib/module-colors.test.ts) — только разбирает файлы.
 */

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8')

const css = read('app', 'globals.css')
const buttonSrc = read('components', 'ui', 'Button.tsx')
const badgeSrc = read('components', 'ui', 'Badge.tsx')

/** Значение токена из globals.css (первое вхождение = светлая тема/базовый :root). */
function token(name: string): string | null {
  const m = new RegExp(`--${name}\\s*:\\s*([^;}]+)`).exec(css)
  return m ? m[1].trim() : null
}

describe('шкалы объявлены в globals.css', () => {
  it('радиусы: sm/md/lg/pill', () => {
    expect(token('r-sm')).toBe('6px')
    expect(token('r-md')).toBe('10px')
    expect(token('r-lg')).toBe('14px')
    expect(token('r-pill')).toBe('999px')
  })

  it('отступы: шаг 4px, шесть ступеней', () => {
    const expected = ['4px', '8px', '12px', '16px', '20px', '24px']
    expected.forEach((v, i) => expect(token(`sp-${i + 1}`), `--sp-${i + 1}`).toBe(v))
  })

  it('кегли: базовый размер приложения — 13px', () => {
    expect(token('fs-xs')).toBe('11px')
    expect(token('fs-sm')).toBe('12px')
    expect(token('fs-base')).toBe('13px')
    expect(token('fs-md')).toBe('14px')
    expect(token('fs-lg')).toBe('16px')
    expect(token('fs-xl')).toBe('20px')
  })

  it('насыщенности: ровно четыре ступени, без одноразовых 650/750', () => {
    expect(token('fw-normal')).toBe('400')
    expect(token('fw-medium')).toBe('500')
    expect(token('fw-semibold')).toBe('600')
    expect(token('fw-bold')).toBe('700')
    expect(css).not.toMatch(/--fw-[a-z]+:\s*(650|750)\b/)
  })

  it('слои: модалка выше шапки, шапка выше сайдбара, сайдбар выше подложки', () => {
    const z = (n: string) => Number(token(n))
    expect(z('z-backdrop')).toBe(30)
    expect(z('z-sidebar')).toBe(40)
    expect(z('z-header')).toBe(50)
    expect(z('z-modal')).toBe(1000)
    expect(z('z-modal')).toBeGreaterThan(z('z-header'))
    expect(z('z-header')).toBeGreaterThan(z('z-sidebar'))
    expect(z('z-sidebar')).toBeGreaterThan(z('z-backdrop'))
  })
})

describe('--shadow-sm — тень темы, а не шкала: объявлена во всех блоках тем', () => {
  // Тень цветная, поэтому она обязана следовать той же трёхблочной схеме, что и
  // остальные токены темы (:root, @media dark, :root[data-theme=…]) — рядом с
  // существующим --shadow. Иначе в тёмной теме «лёгкая» тень осталась бы
  // светлой и на тёмном фоне выглядела бы грязным ореолом.
  const shadowBlocks = css.match(/--shadow\s*:/g) ?? []
  const shadowSmBlocks = css.match(/--shadow-sm\s*:/g) ?? []

  it('объявлена столько же раз, сколько существующая --shadow', () => {
    expect(shadowBlocks.length).toBeGreaterThanOrEqual(3)
    expect(shadowSmBlocks.length).toBe(shadowBlocks.length)
  })

  it('легче основной тени (меньше радиус размытия)', () => {
    const blur = (name: string) => {
      const m = new RegExp(`--${name}\\s*:\\s*[^;]*?\\d+px\\s+(-?\\d+)px`).exec(css)
      return m ? Number(m[1]) : NaN
    }
    expect(blur('shadow-sm')).toBeLessThan(blur('shadow'))
  })
})

describe('примитивы Button/Badge не содержат литеральных цветов', () => {
  // #fff / #1b2230 / rgb(...) в примитиве = цвет, который не меняется вместе с
  // темой. Разрешены только var(--…)-токены.
  const HEX = /#[0-9a-fA-F]{3,8}\b/g

  it('Button.tsx', () => {
    expect(buttonSrc.match(HEX)).toBeNull()
  })

  it('Badge.tsx', () => {
    expect(badgeSrc.match(HEX)).toBeNull()
  })

  it('Button.tsx: размеры взяты из шкал, а не написаны числами', () => {
    for (const v of ['var(--r-md)', 'var(--fs-base)', 'var(--fw-semibold)', 'var(--sp-4)']) {
      expect(buttonSrc, `нет ${v}`).toContain(v)
    }
  })

  it('Badge.tsx: таблетка, мелкий кегль, полужирный — из шкал', () => {
    for (const v of ['var(--r-pill)', 'var(--fs-xs)', 'var(--fw-semibold)']) {
      expect(badgeSrc, `нет ${v}`).toContain(v)
    }
    // Собственного светлого фона у чипа нет: цвет приходит токеном снаружи.
    expect(badgeSrc).toContain('var(--surface-2)')
  })

  it('примитивы не используют физические left/right — приложение RTL', () => {
    for (const src of [buttonSrc, badgeSrc]) {
      expect(src).not.toMatch(/\b(marginLeft|marginRight|paddingLeft|paddingRight|borderLeft|borderRight)\b/)
      expect(src).not.toMatch(/textAlign:\s*'(left|right)'/)
    }
  })
})
