import type { ReactNode } from 'react'

/**
 * Поле формы — один вид во всей системе (дизайн-план, этап 5): подпись над
 * полем, красная звёздочка у обязательного, серая подсказка и ошибка под
 * полем. Заменяет локальные копии `Field` в модулях.
 *
 * required — показать звёздочку. Для совместимости подпись, оканчивающаяся
 * на " *" (так писали раньше), тоже даёт красную звёздочку.
 * full — поле на всю ширину сетки <FormGrid>.
 */
export function FormField({ label, children, required, hint, error, full }: {
  label: string
  children: ReactNode
  required?: boolean
  hint?: ReactNode
  error?: ReactNode
  full?: boolean
}) {
  const star = required || label.endsWith(' *')
  const text = label.endsWith(' *') ? label.slice(0, -2) : label
  return (
    <label style={{ display: 'grid', gap: 5, alignContent: 'start', minWidth: 0, gridColumn: full ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)' }}>
        {text}
        {star && <span aria-hidden="true" style={{ color: 'var(--danger)', marginInlineStart: 3 }}>*</span>}
      </span>
      {children}
      {error
        ? <span role="alert" style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</span>
        : hint && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{hint}</span>}
    </label>
  )
}

/**
 * Сетка полей формы: две колонки на компьютере, одна на телефоне; ширина —
 * до 760px, чтобы взгляд не «ездил» через весь экран. Прижата к началу
 * строки — под заголовком карточки, а не по центру (центр отрывал поля от
 * заголовка).
 */
export function FormGrid({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 | 3 }) {
  return (
    <div className="form-grid" style={{
      display: 'grid', gap: '12px 16px', maxWidth: columns === 3 ? 980 : 760, width: '100%',
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    }}>
      {children}
    </div>
  )
}

/** Группа полей с маленьким заголовком (необязательная иконка слева). */
export function FormSection({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
        {icon}{title}
      </h3>
      {children}
    </section>
  )
}
