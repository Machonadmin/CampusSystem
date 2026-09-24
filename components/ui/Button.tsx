import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

/**
 * Единая кнопка приложения.
 *
 * ЗАЧЕМ. До неё в коде жило ~15 расходящихся описаний одной и той же кнопки:
 * в каждом экране свой файловый `const btn` / `btnGhost` с собственными
 * числами (padding '7px 16px' против '8px 16px' против '8px 14px', radius 8
 * против 6, fontSize 13 против 11), а «первичная» кнопка местами прибивала
 * подпись литеральным белым — в тёмной теме белый текст ложился на светлый
 * акцент и читался плохо. Ни одно из этих определений нельзя было починить
 * централизованно.
 *
 * Теперь вид кнопки задаётся ТОЛЬКО через variant/size, а размеры берутся из
 * шкал globals.css (--r-*, --sp-*, --fs-*, --fw-*). Цвета — только токены темы,
 * ни одного литерального hex, поэтому кнопка сама переключается со светлой темы
 * на тёмную.
 *
 * Варианты:
 *   primary   — акцентная заливка, текст --accent-contrast (в тёмной теме он
 *               тёмный, а не белый: именно этого не умели старые кнопки);
 *   secondary — поверхность + рамка (значение по умолчанию, бывший btnGhost);
 *   ghost     — прозрачная, без рамки (действия внутри строк и панелей);
 *   danger    — тонированная опасным цветом (удаление).
 *
 * Кнопка прозрачна для пропсов <button>: type, onClick, disabled, aria-*,
 * title и т.д. уходят на элемент как есть, а `style` домешивается ПОСЛЕ
 * базовых стилей — точечная правка (например marginInlineStart:'auto')
 * по-прежнему работает у вызывающей стороны.
 *
 * RTL: приложение на иврите, поэтому внутри — только логические свойства.
 */

const SIZE: Record<ButtonSize, CSSProperties> = {
  sm: { fontSize: 'var(--fs-sm)', padding: 'var(--sp-1) var(--sp-3)' },
  md: { fontSize: 'var(--fs-base)', padding: 'var(--sp-2) var(--sp-4)' },
}

const VARIANT: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: 'var(--accent)',
    color: 'var(--accent-contrast)',
    border: '1px solid var(--accent)',
  },
  secondary: {
    background: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--border-strong)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid transparent',
  },
  danger: {
    background: 'var(--danger-tint)',
    color: 'var(--danger)',
    border: '1px solid var(--danger)',
  },
}

/**
 * Стили кнопки как объект — для случаев, когда нужен не <Button>, а другой
 * элемент с тем же видом (например <SubmitButton>, который добавляет спиннер
 * загрузки). Так вид остаётся единым, даже если элемент другой.
 */
export function buttonStyle(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
  disabled = false,
): CSSProperties {
  return {
    ...SIZE[size],
    ...VARIANT[variant],
    fontFamily: 'inherit',
    fontWeight: 'var(--fw-semibold)' as unknown as CSSProperties['fontWeight'],
    borderRadius: 'var(--r-md)',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}

export function Button({
  variant = 'secondary',
  size = 'md',
  children,
  style,
  disabled,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  children?: ReactNode
}) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      // style вызывающей стороны идёт последним — она может перекрыть базу.
      style={{ ...buttonStyle(variant, size, Boolean(disabled)), ...style }}
    >
      {children}
    </button>
  )
}
