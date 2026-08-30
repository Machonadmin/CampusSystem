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

// 'ios-needs-install' — iPhone/iPad НЕ в режиме установленного PWA: iOS даёт
// пуши только из приложения на «Домой», в Safari-табе PushManager вообще нет.
export type PushState = 'unsupported' | 'ios-needs-install' | 'denied' | 'subscribed' | 'available'

/** Standalone-режим (установленное на «Домой» приложение). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1)
}

/** Текущее состояние пушей на ЭТОМ устройстве. */
export async function getPushState(): Promise<PushState> {
  // iOS без установки: push-объектов ещё нет — объясняем, а не «не поддерживается».
  if (isIOS() && !isStandalone()) return 'ios-needs-install'
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

export type EnableReason = 'ok' | 'unsupported' | 'ios-needs-install' | 'denied' | 'no-key' | 'error'

/**
 * Полный цикл включения: permission → subscribe → сохранить на сервере.
 * Возвращает конкретную причину, чтобы UI показал, ЧТО именно пошло не так
 * (владелец: «не даёт включить» — раньше было молчаливое false).
 */
export async function enablePush(): Promise<EnableReason> {
  if (isIOS() && !isStandalone()) return 'ios-needs-install'
  if (!pushSupported()) return 'unsupported'
  try {
    // requestPermission — синхронно в пользовательском жесте (важно для iOS).
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'denied'

    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerSW())
    if (!reg) return 'error'

    const keyRes = await fetch('/api/push/public-key')
    if (!keyRes.ok) return 'no-key'
    const { key } = await keyRes.json() as { key?: string }
    if (!key) return 'no-key'

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
    return save.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}
