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
 * Есть ли в истории браузера куда возвращаться внутри приложения. history.length>1
 * означает, что текущая запись не единственная в стеке этого окна/вкладки (в
 * standalone-PWA дно стека — start_url, поэтому после любой навигации length>1).
 * SSR-безопасно (нет window → false).
 */
export function canGoBackInApp(): boolean {
  return typeof window !== 'undefined' && window.history.length > 1
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
