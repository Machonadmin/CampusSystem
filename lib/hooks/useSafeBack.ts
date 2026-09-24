'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

/**
 * «Назад» для кнопок внутри приложения. Правильный «назад» — это РЕАЛЬНАЯ история
 * браузера (router.back()), а не router.push('<родитель>'): push добавляет ещё
 * одну запись вперёд и уводит не туда, откуда пришёл пользователь. Реальный back
 * возвращает на ТОЧНО предыдущий экран (список/карточку/вкладку) и на десктопе,
 * и в установленном PWA.
 *
 * Если истории внутри приложения нет (прямой вход по ссылке / первая запись стека
 * в standalone-PWA), back() ушёл бы из приложения — тогда падаем на РАЗУМНОГО
 * родителя (не на главную).
 *
 * Решение о цели вынесено в чистую функцию resolveBackTarget — её легко тестировать.
 */

export interface BackDecision {
  action: 'back' | 'push'
  href?: string
}

/**
 * Куда вести «назад»: если внутри приложения есть куда возвращаться — реальный
 * back; иначе — безопасный родитель (fallback). Чистая функция (без router/DOM).
 */
export function resolveBackTarget(opts: { canGoBack: boolean; fallback: string }): BackDecision {
  return opts.canGoBack ? { action: 'back' } : { action: 'push', href: opts.fallback }
}

/**
 * Глубина истории ВНУТРИ приложения в этом документе. Раньше проверяли
 * history.length > 1 — но это считает и чужие страницы, открытые в той же вкладке
 * до входа в систему: «חזרה» на карточке уводил из приложения. Теперь глубину
 * ведёт InAppNavTracker (в layout дашборда): переход вперёд +1, «назад» браузера −1.
 * Полная перезагрузка страницы обнуляет её — тогда «חזרה» ведёт в fallback.
 */
let inAppDepth = 0

/** Чистая функция шага глубины (для тестов). */
export function nextNavDepth(depth: number, kind: 'push' | 'pop'): number {
  return kind === 'push' ? depth + 1 : Math.max(0, depth - 1)
}

/** Вызывается трекером на каждую смену адреса внутри приложения. */
export function recordInAppNavigation(kind: 'push' | 'pop'): void {
  inAppDepth = nextNavDepth(inAppDepth, kind)
}

/** Есть ли внутри приложения куда возвращаться. SSR-безопасно (нет window → false). */
export function canGoBackInApp(): boolean {
  return typeof window !== 'undefined' && inAppDepth > 0
}

/**
 * Хук: возвращает обработчик «назад» для in-app кнопки. fallback — родительский
 * маршрут на случай отсутствия истории (например '/dashboard/education').
 */
export function useSafeBack(fallback: string): () => void {
  const router = useRouter()
  return useCallback(() => {
    const decision = resolveBackTarget({ canGoBack: canGoBackInApp(), fallback })
    if (decision.action === 'back') router.back()
    else router.push(decision.href as string)
  }, [router, fallback])
}
