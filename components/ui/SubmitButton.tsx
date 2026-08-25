import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './Spinner'

/**
 * Кнопка отправки формы с единым индикатором загрузки: пока loading=true —
 * показывает крутящийся <Spinner> рядом с подписью, блокируется и меняет
 * курсор. Заменяет разнобой ручных `disabled={saving}` + текстовой подмены
 * без анимации (из-за которого кнопка выглядела «зависшей»).
 *
 * Стиль передаётся как обычно (сохраняем вид каждой кнопки), добавляется лишь
 * inline-flex, чтобы спиннер встал в строку с текстом. loadingLabel — опц.
 * подпись на время загрузки (иначе показываем те же children).
 */
export function SubmitButton({
  loading = false,
  loadingLabel,
  spinnerColor,
  children,
  disabled,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
  loadingLabel?: ReactNode
  spinnerColor?: string
}) {
  return (
    <button
      {...rest}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        ...style,
        ...(loading ? { cursor: 'progress' } : null),
      }}
    >
      {loading && <Spinner color={spinnerColor} />}
      {loading && loadingLabel != null ? loadingLabel : children}
    </button>
  )
}
