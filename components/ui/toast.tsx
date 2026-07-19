'use client'

import { useEffect, useState } from 'react'

/**
 * Лёгкие всплывающие уведомления (toast) — замена нативному alert().
 * Не блокируют интерфейс, авто-исчезают, единый вид во всех модулях, знают тему
 * (light/dark) через CSS-переменные.
 *
 * Провайдер НЕ нужен: `toast(...)` шлёт событие в глобальный emitter, а один
 * <Toaster/> (смонтирован в dashboard layout) его рисует. Поэтому вызывать
 * toast() можно из любого клиентского компонента: `import { toast } …; toast(msg)`.
 */

export type ToastKind = 'error' | 'success' | 'info'
export interface ToastItem { id: number; message: string; kind: ToastKind }

let counter = 0
const listeners = new Set<(t: ToastItem) => void>()

export function toast(message: string, kind: ToastKind = 'info'): void {
  if (!message) return
  const item: ToastItem = { id: ++counter, message: String(message), kind }
  for (const l of listeners) l(item)
}
export const toastError = (message: string) => toast(message, 'error')
export const toastSuccess = (message: string) => toast(message, 'success')

const STYLE: Record<ToastKind, { bg: string; fg: string; border: string }> = {
  error:   { bg: 'var(--danger-tint, #FEE2E2)',  fg: 'var(--danger, #991B1B)',  border: 'var(--danger, #FCA5A5)' },
  success: { bg: 'var(--success-tint, #D1FAE5)', fg: 'var(--success, #065F46)', border: 'var(--success, #6EE7B7)' },
  info:    { bg: 'var(--surface-2, #F1F5F9)',    fg: 'var(--text, #1E293B)',    border: 'var(--border-strong, #CBD5E1)' },
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const onToast = (t: ToastItem) => {
      setItems(prev => [...prev, t])
      setTimeout(() => setItems(prev => prev.filter(x => x.id !== t.id)), 4500)
    }
    listeners.add(onToast)
    return () => { listeners.delete(onToast) }
  }, [])

  if (items.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed', bottom: 20, insetInlineEnd: 20, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400,
        pointerEvents: 'none',
      }}
    >
      {items.map(t => {
        const s = STYLE[t.kind]
        return (
          <div
            key={t.id}
            onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))}
            role="status"
            style={{
              pointerEvents: 'auto', cursor: 'pointer',
              background: s.bg, color: s.fg, border: `1px solid ${s.border}`,
              borderRadius: 10, padding: '11px 14px', fontSize: 13.5, fontWeight: 500,
              boxShadow: '0 6px 20px rgba(0,0,0,0.15)', lineHeight: 1.4,
              wordBreak: 'break-word',
            }}
          >
            {t.message}
          </div>
        )
      })}
    </div>
  )
}
