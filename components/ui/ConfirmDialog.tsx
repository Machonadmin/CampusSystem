'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Стилизованное подтверждение вместо нативного confirm(): в теме приложения,
 * RTL-безопасное, с клавиатурой (Esc = отмена, Enter = подтвердить) и кликом по
 * фону для отмены. Опасное действие (tone 'danger') красит кнопку в var(--danger).
 *
 * Провайдер НЕ нужен: `confirmDialog(...)` шлёт запрос в глобальный emitter, а
 * один <ConfirmRoot/> (смонтирован в dashboard layout) его рисует. Вызывать
 * можно из любого клиентского компонента:
 *   import { confirmDialog } from '@/components/ui/ConfirmDialog'
 *   if (!(await confirmDialog({ message, tone: 'danger' }))) return
 *
 * confirmLabel / cancelLabel — необязательны (по умолчанию «אישור» / «ביטול»).
 */

export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}

interface Req { opts: ConfirmOptions; resolve: (v: boolean) => void }

let listener: ((r: Req) => void) | null = null

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    // Корень ещё не смонтирован (крайне редко) — деградируем к нативному confirm.
    if (!listener) { resolve(window.confirm(opts.message)); return }
    listener({ opts, resolve })
  })
}

export function ConfirmRoot() {
  const t = useTranslations('common')
  const [req, setReq] = useState<Req | null>(null)
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    listener = (r: Req) => setReq(r)
    return () => { listener = null }
  }, [])

  useEffect(() => {
    if (!req) return
    confirmRef.current?.focus()
    const done = (v: boolean) => { req.resolve(v); setReq(null) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false) }
      else if (e.key === 'Enter') { e.preventDefault(); done(true) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [req])

  if (!req) return null
  const { opts } = req
  const done = (v: boolean) => { req.resolve(v); setReq(null) }
  const danger = opts.tone === 'danger'
  const confirmLabel = opts.confirmLabel ?? t('confirm_ok')
  const cancelLabel = opts.cancelLabel ?? t('cancel')

  return (
    <div
      role="presentation"
      className="anim-fade"
      onClick={() => done(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="anim-pop"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: 'var(--shadow-lg, 0 12px 32px rgba(0,0,0,0.25))', padding: 20,
        }}
      >
        {opts.title && (
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{opts.title}</h3>
        )}
        <p style={{ margin: '0 0 18px', fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-muted)', whiteSpace: 'pre-line' }}>
          {opts.message}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => done(false)}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8,
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => done(true)}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              color: '#fff', border: 'none', borderRadius: 8,
              background: danger ? 'var(--danger)' : 'var(--accent)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
