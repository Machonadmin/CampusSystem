/**
 * «Вернулся после перерыва — попадаешь на главный экран».
 *
 * На телефоне установленное приложение (или вкладка браузера) остаётся открытым
 * в фоне, и при возвращении ОС показывает последний экран — даже через несколько
 * дней. Владелец попросил: если приложением не пользовались час и больше,
 * открывать главный экран (решение 2026-11-18, «אפילו אחרי שעה בלי שימוש»).
 *
 * «Не пользовались» = приложение было скрыто (экран выключен, переключились в
 * другое приложение/вкладку). Время отсчитывается от момента скрытия.
 *
 * Только на сенсорных устройствах (телефон/планшет): на компьютере систему
 * держат открытой во вкладке рядом с другой работой, и возврат на главную через
 * час уводил бы с нужного списка.
 *
 * Никогда не уводим, если человек мог что-то набирать: открыто модальное окно,
 * это экран правки (…/edit, …/new) или на этом экране уже что-то вводили/меняли.
 *
 * Решение — чистая функция (без DOM/router), её проверяют тесты; компонент
 * components/ui/IdleReturnHome.tsx только собирает входные данные.
 */

/** Сколько приложение должно пробыть скрытым, чтобы вернуть на главный экран. */
export const IDLE_RETURN_MS = 60 * 60 * 1000

/** Ключ sessionStorage: когда приложение ушло в фон (мс с эпохи). */
export const HIDDEN_AT_KEY = 'campus:hidden-at'

export interface IdleReturnInput {
  /** Сколько мс приложение было скрыто. */
  awayMs: number
  /** Текущий путь (без query). */
  pathname: string
  /** Сенсорное устройство (hover: none + pointer: coarse). */
  isTouchDevice: boolean
  /** Открыто модальное окно (aria-modal="true"). */
  dialogOpen: boolean
  /** На текущем экране что-то вводили или меняли. */
  editedOnScreen: boolean
}

/** Экран правки/создания: …/edit или …/new (в т.ч. с хвостом). */
export function isEditScreen(pathname: string): boolean {
  return /\/(edit|new)(\/|$)/.test(pathname)
}

export function shouldReturnHome(input: IdleReturnInput): boolean {
  if (!input.isTouchDevice) return false
  if (!Number.isFinite(input.awayMs) || input.awayMs < IDLE_RETURN_MS) return false
  if (!input.pathname.startsWith('/dashboard')) return false
  if (isEditScreen(input.pathname)) return false
  if (input.dialogOpen || input.editedOnScreen) return false
  return true
}

/** Разбор сохранённой метки времени; мусор → null. */
export function parseHiddenAt(raw: string | null): number | null {
  if (raw === null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}
