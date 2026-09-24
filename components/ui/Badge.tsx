import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'success' | 'warn' | 'danger' | 'info'

/** Пара «фон + текст» чипа. Значения — токены темы, а не литеральные цвета. */
export type BadgeColors = { bg: string; fg: string }

/**
 * Чип-«таблетка»: статус, приоритет, роль, метка модуля.
 *
 * ЗАЧЕМ. Локальные компоненты `Badge` были переписаны в каждом модуле заново
 * (security, maintenance, persons и др.) с разными числами: fontSize 11 против
 * 12, padding '2px 9px' против '3px 10px', borderRadius то 999, то 99, то 50.
 * Смысл при этом везде один. Здесь он описан один раз — по шкалам globals.css:
 * --r-pill, --fs-xs, --fw-semibold.
 *
 * Цвет задаётся ДВУМЯ способами и оба работают в обеих темах:
 *   • tone — семантика состояния ('neutral' | 'success' | 'warn' | 'danger' |
 *     'info'); раскрывается в пары токенов --*-tint / --*;
 *   • colors — произвольная пара {bg, fg}: так приходят цвета модулей
 *     (var(--mod-X-tint) / var(--mod-X)) и таблицы статусов конкретных экранов.
 * Собственного светлого фона компонент НЕ задаёт: подставляется только то, что
 * пришло токенами, иначе в тёмной теме чип был бы почти белой плашкой (ровно
 * эта болезнь была у прежней палитры модулей). По умолчанию — нейтральный чип
 * на --surface-2.
 */

const TONE: Record<BadgeTone, BadgeColors> = {
  neutral: { bg: 'var(--surface-2)', fg: 'var(--text-muted)' },
  success: { bg: 'var(--success-tint)', fg: 'var(--success)' },
  warn: { bg: 'var(--warn-tint)', fg: 'var(--warn)' },
  danger: { bg: 'var(--danger-tint)', fg: 'var(--danger)' },
  info: { bg: 'var(--info-tint)', fg: 'var(--info)' },
}

export function Badge({
  label,
  children,
  colors,
  tone = 'neutral',
  strong = false,
  style,
  ...rest
}: Omit<HTMLAttributes<HTMLSpanElement>, 'color'> & {
  /** Подпись чипа. Альтернатива children — что удобнее на месте вызова. */
  label?: ReactNode
  children?: ReactNode
  /** Явная пара цветов (перекрывает tone): модульные и статусные чипы. */
  colors?: BadgeColors
  tone?: BadgeTone
  /** Усиленная насыщенность — для «кричащих» статусов (критично/срочно). */
  strong?: boolean
}) {
  const c = colors ?? TONE[tone]
  const base: CSSProperties = {
    display: 'inline-block',
    // Половина шага шкалы по вертикали: чип остаётся низким, но не «слипается».
    padding: 'calc(var(--sp-1) / 2) var(--sp-2)',
    borderRadius: 'var(--r-pill)',
    fontSize: 'var(--fs-xs)',
    fontWeight: (strong ? 'var(--fw-bold)' : 'var(--fw-semibold)') as unknown as CSSProperties['fontWeight'],
    background: c.bg,
    color: c.fg,
    whiteSpace: 'nowrap',
    lineHeight: 1.45,
  }
  return (
    <span {...rest} style={{ ...base, ...style }}>
      {label ?? children}
    </span>
  )
}
