// ─── Снимок текущего экрана для «הצעה לשיפור או באג» ─────────────────────────
//
// Кнопка-«жучок» (components/dashboard/BugReportButton.tsx) перед открытием
// формы фотографирует то, что сотрудник видит прямо сейчас, и прикладывает
// снимок к замечанию. Браузер не даёт сайту сделать настоящий скриншот без
// отдельного запроса разрешения (а на телефоне не даёт вовсе), поэтому страница
// перерисовывается в картинку из её собственной разметки (modern-screenshot).
// Снимается только видимая часть окна. Элементы с атрибутом
// data-no-screenshot (сама кнопка, всплывающие уведомления) в снимок не попадают.
// Если снять не вышло — возвращается null, и форма открывается без снимка.

/** Атрибут, которым помечают то, что не должно попасть в снимок. */
export const NO_SCREENSHOT_ATTR = 'data-no-screenshot'

export async function captureVisibleScreen(): Promise<File | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  try {
    const { domToBlob } = await import('modern-screenshot')
    const body = document.body
    const width = window.innerWidth
    const height = window.innerHeight
    const bg = getComputedStyle(body).backgroundColor
    const blob = await domToBlob(body, {
      width,
      height,
      // Чётко, но без огромных файлов: дальше картинку всё равно ужмёт shrink.ts.
      scale: Math.min(window.devicePixelRatio || 1, 2),
      backgroundColor: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#ffffff',
      type: 'image/jpeg',
      quality: 0.9,
      timeout: 15000,
      filter: (node: Node) => !(node instanceof Element && node.hasAttribute(NO_SCREENSHOT_ATTR)),
      // Страница прокручивается окном: сдвигаем обычный контент вверх на величину
      // прокрутки, чтобы в кадр попала видимая часть. Шапка и меню закреплены
      // (position: fixed) и остаются на своих местах.
      style: {
        marginTop: `${-window.scrollY}px`,
        height: 'auto',
        overflow: 'visible',
      },
    })
    if (!blob || blob.size === 0) return null
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    return new File([blob], `screen-${stamp}.jpg`, { type: 'image/jpeg' })
  } catch {
    return null
  }
}
