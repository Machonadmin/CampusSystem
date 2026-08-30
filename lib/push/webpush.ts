import webpush from 'web-push'
import { createServerClient } from '@/lib/supabase/server'
import { getAppSetting, setAppSetting } from '@/lib/settings/app-settings'

type SB = ReturnType<typeof createServerClient>

/**
 * Web Push (реальные пуш-уведомления на телефон для установленного PWA).
 *
 * БЕЗ миграций и БЕЗ env-переменных от владельца:
 *   • VAPID-ключи генерируются один раз и хранятся в app_settings
 *     (ключ 'webpush_vapid') — тот же KV, что и signature_method;
 *   • подписки пользователей хранятся per-person в app_settings
 *     ('push_subs:<person_id>' → массив PushSubscription JSON). Объём крошечный
 *     (десятки сотрудников × 1-3 устройства).
 *
 * Best-effort повсюду: отправка пуша НИКОГДА не роняет вызывающий код.
 * Протухшие подписки (404/410 от push-сервиса) удаляются на лету.
 */

interface VapidKeys { publicKey: string; privateKey: string }
interface StoredSub {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

const VAPID_SETTING = 'webpush_vapid'
const SUBS_PREFIX = 'push_subs:'
// mailto обязателен по спеке VAPID; адрес не используется для отправки почты.
const VAPID_SUBJECT = 'mailto:oficepresident@gmail.com'

let cachedVapid: VapidKeys | null = null

/** Возвращает VAPID-ключи, генерируя и сохраняя их при первом обращении. */
export async function getVapidKeys(): Promise<VapidKeys | null> {
  if (cachedVapid) return cachedVapid
  try {
    const existing = await getAppSetting<VapidKeys | null>(VAPID_SETTING, null)
    if (existing?.publicKey && existing?.privateKey) {
      cachedVapid = existing
      return existing
    }
    const generated = webpush.generateVAPIDKeys()
    await setAppSetting(VAPID_SETTING, generated, 'system:webpush')
    cachedVapid = generated
    return generated
  } catch (e) {
    console.error('[push] vapid keys:', e)
    return null
  }
}

function subsKey(personId: string): string {
  return `${SUBS_PREFIX}${personId}`
}

/** Добавляет/обновляет подписку устройства (дедуп по endpoint). */
export async function addSubscription(personId: string, sub: StoredSub): Promise<void> {
  const list = await getAppSetting<StoredSub[]>(subsKey(personId), [])
  const next = [...list.filter(s => s.endpoint !== sub.endpoint), sub].slice(-5) // максимум 5 устройств
  await setAppSetting(subsKey(personId), next, personId)
}

/** Удаляет подписку устройства по endpoint. */
export async function removeSubscription(personId: string, endpoint: string): Promise<void> {
  const list = await getAppSetting<StoredSub[]>(subsKey(personId), [])
  await setAppSetting(subsKey(personId), list.filter(s => s.endpoint !== endpoint), personId)
}

export interface PushPayload {
  title: string
  body?: string | null
  link?: string | null
}

/**
 * Шлёт пуш на все устройства пользователя. Best-effort: ошибки логируются,
 * протухшие подписки удаляются, наружу ничего не бросается.
 */
export async function sendPushToPerson(_sb: SB, personId: string, payload: PushPayload): Promise<void> {
  try {
    const vapid = await getVapidKeys()
    if (!vapid) return
    const subs = await getAppSetting<StoredSub[]>(subsKey(personId), [])
    if (subs.length === 0) return

    webpush.setVapidDetails(VAPID_SUBJECT, vapid.publicKey, vapid.privateKey)
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? '',
      link: payload.link ?? '/dashboard',
    })

    const results = await Promise.allSettled(
      subs.map(s => webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys },
        body,
        { TTL: 3600 },
      )),
    )
    // Чистим мёртвые подписки (устройство отписалось/переустановило браузер).
    const dead: string[] = []
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const code = (r.reason as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) dead.push(subs[i].endpoint)
        else console.error('[push] send:', r.reason)
      }
    })
    if (dead.length > 0) {
      const alive = subs.filter(s => !dead.includes(s.endpoint))
      await setAppSetting(subsKey(personId), alive, personId)
    }
  } catch (e) {
    console.error('[push] sendPushToPerson:', e)
  }
}
