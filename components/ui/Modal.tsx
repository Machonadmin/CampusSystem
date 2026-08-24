'use client'

import { useEffect, useRef } from 'react'

/**
 * Единый модальный контейнер вместо ~43 руками собранных оверлеев (у которых
 * разъехались прозрачность фона и z-index). Даёт:
 *   • фон (canonical z-index) + центрированную панель (surface/радиус/тень);
 *   • закрытие по Escape (везде) и — опционально — по клику по фону;
 *   • role="dialog" + aria-modal + перевод фокуса внутрь при открытии;
 *   • ловушку фокуса (Tab/Shift+Tab не уходят на фон) + возврат фокуса на
 *     элемент-триггер при закрытии — доступность для клавиатуры;
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      // Ловушка фокуса: Tab по кругу внутри панели, не выпускает на фон.
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => el.offsetParent !== null || el === document.activeElement)
      if (focusable.length === 0) { e.preventDefault(); panel.focus(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || active === panel || !panel.contains(active)) {
          e.preventDefault(); last.focus()
        }
      } else {
        if (active === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Перевод фокуса внутрь диалога при открытии (если внутри ничего не
  // сфокусировано — autoFocus-инпуты забирают фокус синхронно, их не трогаем)
  // и возврат фокуса на элемент-триггер при закрытии.
  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus()
    return () => {
      if (prevActive && typeof prevActive.focus === 'function' && document.contains(prevActive)) {
        prevActive.focus()
      }
    }
  }, [])

  // Блокировка прокрутки фона, пока диалог открыт (чтобы колесо/тач не
  // скроллили страницу за оверлеем). Вложенные модалки корректны: каждая
  // сохраняет своё значение overflow и восстанавливает его при закрытии.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
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
