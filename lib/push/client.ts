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

/**
 * Регистрация с АКТИВНЫМ service worker. pushManager.subscribe на только что
 * зарегистрированном (ещё installing) воркере падает с «no active Service
 * Worker» (типично для первого нажатия «הפעל» на Android).
 */
async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!(await navigator.serviceWorker.getRegistration()) && !(await registerSW())) return null
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 10_000))
  return Promise.race([navigator.serviceWorker.ready, timeout])
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

    const reg = await activeRegistration()
    if (!reg) return 'error'

    const key = await fetchPublicKey()
    if (!key) return 'no-key'

    const sub = await ensureSubscription(reg, key)
    return (await saveSubscription(sub)) ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

async function fetchPublicKey(): Promise<string | null> {
  const keyRes = await fetch('/api/push/public-key')
  if (!keyRes.ok) return null
  const { key } = await keyRes.json() as { key?: string }
  return key || null
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false
  const x = new Uint8Array(a)
  return x.length === b.length && x.every((v, i) => v === b[i])
}

/**
 * Подписка устройства под ТЕКУЩИЙ ключ сервера. Если браузер держит подписку,
 * сделанную под другой ключ (ключи сервера сменились), пуши на неё отклоняются
 * push-сервисом, а колокольчик при этом показывал «подписано» — отписываемся и
 * подписываемся заново.
 */
async function ensureSubscription(reg: ServiceWorkerRegistration, key: string): Promise<PushSubscription> {
  const serverKey = urlBase64ToUint8Array(key)
  const existing = await reg.pushManager.getSubscription()
  if (existing && sameKey(existing.options?.applicationServerKey, serverKey)) return existing
  if (existing) await existing.unsubscribe().catch(() => false)
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: serverKey as BufferSource,
  })
}

async function saveSubscription(sub: PushSubscription): Promise<boolean> {
  const save = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  })
  return save.ok
}

/**
 * Тихая сверка при каждом открытии, если разрешение уже выдано: подписка под
 * актуальный ключ и заново сохранена на сервере. Лечит устройства, которые
 * «подписаны» в браузере, но сервер о них не знает (или знает под старым
 * ключом) — раньше такие устройства молча ничего не получали. Никогда не
 * запрашивает разрешение (без жеста пользователя это запрещено).
 */
export async function syncPush(): Promise<void> {
  if (isIOS() && !isStandalone()) return
  if (!pushSupported() || Notification.permission !== 'granted') return
  try {
    const reg = await activeRegistration()
    if (!reg) return
    const key = await fetchPublicKey()
    if (!key) return
    await saveSubscription(await ensureSubscription(reg, key))
  } catch { /* тихо: кнопка «הפעל» остаётся запасным путём */ }
}

export interface PushTestResult { devices: number; sent: number; failed: number[]; noKeys?: boolean }

/** Тестовый пуш на все устройства текущего пользователя. null — запрос не прошёл. */
export async function sendTestPush(): Promise<PushTestResult | null> {
  try {
    const res = await fetch('/api/push/test', { method: 'POST' })
    if (!res.ok) return null
    return await res.json() as PushTestResult
  } catch {
    return null
  }
}

