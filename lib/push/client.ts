'use client'

/**
 * Клиентские помощники Web Push: регистрация service worker и подписка
 * устройства на пуши. Всё feature-detected — на браузерах без поддержки
 * (старые iOS, http) тихо no-op.
 *
 * ВАЖНО для iPhone: пуши работают только когда приложение УСТАНОВЛЕНО на экран
 * «Домой» (iOS ≥ 16.4) — в обычном Safari-табе iOS их не даёт.
 */

export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

/** Регистрирует service worker (идемпотентно). Возвращает registration|null. */
export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export type PushState = 'unsupported' | 'denied' | 'subscribed' | 'available'

/** Текущее состояние пушей на ЭТОМ устройстве. */
export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = reg ? await reg.pushManager.getSubscription() : null
    return sub ? 'subscribed' : 'available'
  } catch {
    return 'available'
  }
}

/**
 * Полный цикл включения: permission → subscribe → сохранить на сервере.
 * Возвращает true при успехе.
 */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerSW())
    if (!reg) return false

    const keyRes = await fetch('/api/push/public-key')
    if (!keyRes.ok) return false
    const { key } = await keyRes.json() as { key?: string }
    if (!key) return false

    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    })

    const save = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    })
    return save.ok
  } catch {
    return false
  }
}
