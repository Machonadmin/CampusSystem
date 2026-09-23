/**
 * Тема «светлая / тёмная» — общая логика для переключателя в шапке и экрана
 * «הפרופיל שלי». По умолчанию тема следует настройке устройства
 * (prefers-color-scheme); явный выбор хранится в localStorage (у каждого свой
 * на его устройстве) и выставляется через data-theme на <html>. Скрипт
 * без-мигания в app/layout.tsx применяет сохранённый выбор до первой отрисовки.
 *
 * Смена темы рассылает событие THEME_EVENT, чтобы второе место, где видна
 * тема (шапка ↔ профиль), обновилось сразу, без перезагрузки.
 */

export type Theme = 'light' | 'dark'
export const THEME_EVENT = 'campus-theme-change'

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(next: Theme): void {
  try { localStorage.setItem('theme', next) } catch { /* приватный режим */ }
  document.documentElement.setAttribute('data-theme', next)
  window.dispatchEvent(new CustomEvent<Theme>(THEME_EVENT, { detail: next }))
}
