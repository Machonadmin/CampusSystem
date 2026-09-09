const IMPLEMENTED_MODULES = new Set([
  'persons', 'education', 'tasks', 'settings', 'staff', 'quality_control', 'alumni', 'finance', 'dormitory', 'food', 'maintenance', 'security', 'doctor', 'psychologist', 'health', 'reports', 'documents', 'contacts', 'sponsors', 'jewishness', 'chavruta',
])

export function isModuleImplemented(moduleCode: string): boolean {
  return IMPLEMENTED_MODULES.has(moduleCode)
}

/**
 * Цвета модулей — ТОКЕНЫ ТЕМЫ, а не фиксированные hex.
 *
 * Раньше здесь была таблица литеральных hex без тёмного варианта. Из-за этого
 * food≡sponsors, alumni≡contacts, finance≡doctor совпадали байт-в-байт, а
 * светлые оттенки использовались как фон «чипов» и в тёмной теме — почти белая
 * плашка на тёмной поверхности. Значения переехали в app/globals.css
 * (секция «Палитра модулей»), где у каждой роли есть светлый и тёмный вариант.
 *
 * Роли (см. подробный комментарий в globals.css):
 *   primary → var(--mod-X)         текст/иконки/активные границы (меняется с темой)
 *   light   → var(--mod-X-tint)    фон чипа                      (меняется с темой)
 *   medium  → полупрозрачный primary — мягкая граница поверх tint; работает в
 *             обеих темах, поэтому отдельный токен не нужен.
 *
 * ВАЖНО: функция возвращает `var(...)`, а не hex. Значит, к результату НЕЛЬЗЯ
 * приклеивать hex-альфу (`${color}18`) — для прозрачности используйте
 * color-mix(in oklab, <цвет> N%, transparent). Также результат нельзя
 * передавать туда, где нужен литеральный цвет (парсер mermaid в classDef,
 * canvas): там берите значения из getComputedStyle, как это делает
 * components/workflow/ProcessGraphModal.tsx.
 */

const KNOWN_MODULES = new Set([
  'dashboard', 'persons', 'education', 'chavruta', 'jewishness', 'staff',
  'quality_control', 'tasks', 'finance', 'dormitory', 'food', 'maintenance',
  'security', 'alumni', 'sponsors', 'doctor', 'psychologist', 'health',
  'documents', 'reports', 'contacts', 'settings',
  // Шаги учебного конвейера. Это НЕ отдельные модули (доступ и права у них от
  // education), но у каждого свой цвет: на главной это три отдельные карточки,
  // и раньше все три брали цвет education, то есть выглядели одинаково.
  'recruitment', 'admission',
])

type Shade = 'primary' | 'light' | 'medium'

/** Имя CSS-переменной модуля; для неизвестного кода — нейтральный fallback. */
function tokenBase(moduleCode: string): string {
  return KNOWN_MODULES.has(moduleCode) ? moduleCode : 'fallback'
}

export function getModuleColor(moduleCode: string, shade: Shade = 'primary'): string {
  const base = tokenBase(moduleCode)
  if (shade === 'light') return `var(--mod-${base}-tint)`
  if (shade === 'medium') return `color-mix(in oklab, var(--mod-${base}) 55%, transparent)`
  return `var(--mod-${base})`
}

export function getModuleHeaderGradient(moduleCode: string): string {
  // Три стопа: светлее → базовый → чуть притемнённый хвост (perceptual oklab-mix).
  // Берём -banner, а НЕ -mod-X: на шапке лежит белый текст (ModuleHeader,
  // color:#fff), поэтому фон обязан остаться глубоким и в тёмной теме — пастель
  // дала бы белое по светлому.
  const banner = `var(--mod-${tokenBase(moduleCode)}-banner)`
  return `linear-gradient(140deg, color-mix(in oklab, ${banner} 78%, #fff) 0%, ${banner} 62%, color-mix(in oklab, ${banner} 84%, #000) 100%)`
}
