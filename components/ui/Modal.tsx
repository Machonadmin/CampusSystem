'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

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
 *
 * СТАНДАРТНЫЙ ВИД (дизайн-план, этап 1). Если передан `title`, Modal сам рисует
 * единую «анатомию» окна:
 *   • шапка: необязательная иконка, заголовок, подзаголовок и кнопка закрытия
 *     (✕ на компьютере, стрелка «назад» на телефоне);
 *   • тело с отступами, которое прокручивается само по себе;
 *   • `footer` — закреплённый низ с кнопками: «שמירה/ביטול» видны всегда,
 *     даже когда форма длинная;
 *   • на телефоне (≤640px) окно раскрывается на весь экран, как в приложении.
 * Без `title` поведение прежнее: разметка целиком на вызывающем.
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
  title,
  subtitle,
  icon,
  footer,
  bodyStyle,
  sheetOnPhone = true,
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
  /** Заголовок окна. Включает стандартный вид (шапка + тело + закреплённый низ). */
  title?: ReactNode
  /** Строка контекста под заголовком: о ком/о чём это окно. */
  subtitle?: ReactNode
  /** Иконка слева от заголовка (в RTL — справа). */
  icon?: ReactNode
  /** Закреплённый низ окна: кнопки действий. Только при `title`. */
  footer?: ReactNode
  /** Доп. стили тела окна (только при `title`). */
  bodyStyle?: React.CSSProperties
  /** На телефоне раскрывать окно на весь экран (по умолчанию да). Для коротких
   *  подтверждений («למחוק?») — false: остаётся карточкой по центру. */
  sheetOnPhone?: boolean
}) {
  const tCommon = useTranslations('common')
  const standard = title != null
  const sheet = standard && sheetOnPhone
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

  const closeLabel = tCommon('close', 'סגירה')

  return (
    <div
      role="presentation"
      className={sheet ? 'anim-fade modal-backdrop modal-sheet' : 'anim-fade modal-backdrop'}
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
        aria-label={ariaLabel ?? (standard && typeof title === 'string' ? title : undefined)}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        className={sheet ? 'anim-pop modal-panel modal-sheet-panel' : 'anim-pop modal-panel'}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 14, width: '100%',
          maxWidth, maxHeight: '90vh', overflowY: 'auto', outline: 'none',
          boxShadow: 'var(--shadow-lg, 0 20px 60px rgba(0,0,0,0.2))',
          ...(standard ? { display: 'flex', flexDirection: 'column', overflowY: 'hidden' } : null),
          ...panelStyle,
        }}
      >
        {standard ? (
          <>
            <div className="modal-head">
              {icon && <span className="modal-head-icon" aria-hidden="true">{icon}</span>}
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 className="modal-title">{title}</h2>
                {subtitle && <div className="modal-subtitle">{subtitle}</div>}
              </div>
              <button type="button" className="modal-close" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
                {/* ✕ на компьютере; на телефоне — стрелка «назад» по направлению письма. */}
                <svg className="modal-close-x" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 18 18 6M6 6l12 12" /></svg>
                <svg className="modal-close-back dir-flip" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
              </button>
            </div>
            <div className="modal-body" style={bodyStyle}>{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </>
        ) : children}
      </div>
    </div>
  )
}
