'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Стилизованное подтверждение вместо нативного confirm(): в теме приложения,
// RTL-безопасное (наследует dir документа), с клавиатурой (Esc = отмена,
// Enter = подтвердить) и кликом по фону для отмены. Опасное действие (tone
// 'danger') красит кнопку подтверждения в var(--danger).
//
// Использование:
//   const { confirm, dialog } = useConfirm()
//   ...
//   if (!(await confirm({ message, confirmLabel, cancelLabel }))) return
//   ...
//   return (<>{/* ... */}{dialog}</>)

export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel: string
  cancelLabel: string
  tone?: 'default' | 'danger'
}

export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>(resolve => {
    resolver.current = resolve
    setOpts(o)
  }), [])

  const settle = useCallback((v: boolean) => {
    resolver.current?.(v)
    resolver.current = null
    setOpts(null)
  }, [])

  const dialog = opts ? (
    <ConfirmDialogView opts={opts} onConfirm={() => settle(true)} onCancel={() => settle(false)} />
  ) : null

  return { confirm, dialog }
}

function ConfirmDialogView({ opts, onConfirm, onCancel }: { opts: ConfirmOptions; onConfirm: () => void; onCancel: () => void }) {
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      else if (e.key === 'Enter') { e.preventDefault(); onConfirm() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, onConfirm])

  const danger = opts.tone === 'danger'

  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: 'var(--shadow-lg, 0 12px 32px rgba(0,0,0,0.25))', padding: 20,
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
            onClick={onCancel}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8,
            }}
          >
            {opts.cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              color: '#fff', border: 'none', borderRadius: 8,
              background: danger ? 'var(--danger)' : 'var(--accent)',
            }}
          >
            {opts.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
