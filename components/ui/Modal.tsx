'use client'

import { useEffect, useRef } from 'react'

/**
 * Единый модальный контейнер вместо ~43 руками собранных оверлеев (у которых
 * разъехались прозрачность фона и z-index). Даёт:
 *   • фон (canonical z-index) + центрированную панель (surface/радиус/тень);
 *   • закрытие по Escape (везде) и — опционально — по клику по фону;
 *   • role="dialog" + aria-modal + перевод фокуса внутрь при открытии;
 *   • встроенную панель НЕ навязывает разметку — заголовок/тело/подвал остаются
 *     на совести вызывающего (миграция минимальна и сохраняет вид).
 *
 * Клик по самой панели НЕ закрывает (stopPropagation). closeOnBackdrop=false по
 * умолчанию — чтобы случайный клик мимо формы не терял введённые данные; включай
 * там, где старый оверлей действительно закрывался по фону.
 */
export function Modal({
  onClose,
  children,
  maxWidth = 480,
  panelStyle,
  closeOnBackdrop = false,
  zIndex = 1000,
  ariaLabel,
  ariaLabelledBy,
  padding = 16,
}: {
  onClose: () => void
  children: React.ReactNode
  maxWidth?: number | string
  panelStyle?: React.CSSProperties
  closeOnBackdrop?: boolean
  zIndex?: number
  ariaLabel?: string
  ariaLabelledBy?: string
  padding?: number
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Перевод фокуса внутрь диалога, если внутри ничего не сфокусировано
  // (autoFocus-инпуты уже забирают фокус синхронно — их не трогаем).
  useEffect(() => {
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus()
  }, [])

  return (
    <div
      role="presentation"
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 12, width: '100%',
          maxWidth, maxHeight: '90vh', overflowY: 'auto', outline: 'none',
          boxShadow: 'var(--shadow-lg, 0 20px 60px rgba(0,0,0,0.2))',
          ...panelStyle,
        }}
      >
        {children}
      </div>
    </div>
  )
}
