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

function isVapid(v: unknown): v is VapidKeys {
  const k = v as VapidKeys | null
  return !!k && typeof k.publicKey === 'string' && !!k.publicKey
    && typeof k.privateKey === 'string' && !!k.privateKey
}

/** Читает сохранённые ключи. `ok:false` — ошибка чтения (НЕ «ключей нет»). */
async function readVapid(sb: SB): Promise<{ ok: true; keys: VapidKeys | null; exists: boolean } | { ok: false }> {
  const { data, error } = await sb
    .from('app_settings')
    .select('value')
    .eq('key', VAPID_SETTING)
    .maybeSingle()
  if (error) {
    console.error('[push] vapid read:', error)
    return { ok: false }
  }
  const value = (data as { value?: unknown } | null)?.value
  return { ok: true, keys: isVapid(value) ? value : null, exists: !!data }
}

/**
 * Возвращает VAPID-ключи, генерируя и сохраняя их при первом обращении.
 *
 * Ключи генерируются РОВНО один раз за жизнь системы. Если они сменятся, ВСЕ
 * уже подписанные устройства молча перестают получать пуши (push-сервис
 * отвечает 403: подписка сделана под другой ключ). Поэтому:
 *   • ошибка чтения ≠ «ключей нет» — при сбое БД возвращаем null и НЕ
 *     перегенерируем (раньше getAppSetting отдавал fallback на любую ошибку,
 *     и временный сбой затирал ключи новыми);
 *   • первая запись — «вставить, если нет» (ignoreDuplicates), а затем
 *     перечитываем: при одновременном холодном старте двух инстансов оба
 *     используют ключи победителя, а не каждый свои.
 */
export async function getVapidKeys(): Promise<VapidKeys | null> {
  if (cachedVapid) return cachedVapid
  try {
    const sb = createServerClient()
    const first = await readVapid(sb)
    if (!first.ok) return null
    if (first.keys) {
      cachedVapid = first.keys
      return first.keys
    }

    const generated = webpush.generateVAPIDKeys()
    // updated_by — UUID REFERENCES persons(id); для системной записи только null.
    // Строка есть, но значение битое — перезаписываем; строки нет — вставляем,
    // не трогая чужую, если её успели создать параллельно.
    const { error: wErr } = await sb
      .from('app_settings')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert({ key: VAPID_SETTING, value: generated as any, updated_by: null, updated_at: new Date().toISOString() },
        { onConflict: 'key', ignoreDuplicates: !first.exists })
    if (wErr) {
      console.error('[push] vapid write:', wErr)
      return null
    }

    const stored = await readVapid(sb)
    if (!stored.ok || !stored.keys) return null
    cachedVapid = stored.keys
    return stored.keys
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
  // Клиент пересылает подписку при каждом открытии — не пишем, если она уже есть.
  if (list.some(s => s.endpoint === sub.endpoint && s.keys?.p256dh === sub.keys.p256dh && s.keys?.auth === sub.keys.auth)) return
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

export interface PushResult {
  /** Сколько устройств пользователя подписано на сервере. */
  devices: number
  sent: number
  /** Коды ответов push-сервиса по неудачным устройствам (0 — сетевая ошибка). */
  failed: number[]
  /** Нет VAPID-ключей (сбой БД) — пуши не отправлялись вовсе. */
  noKeys?: boolean
}

/**
 * Шлёт пуш на все устройства пользователя. Best-effort: ошибки логируются,
 * протухшие подписки удаляются, наружу ничего не бросается.
 */
export async function sendPushToPerson(_sb: SB, personId: string, payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { devices: 0, sent: 0, failed: [] }
  try {
    const vapid = await getVapidKeys()
    if (!vapid) return { ...result, noKeys: true }
    const subs = await getAppSetting<StoredSub[]>(subsKey(personId), [])
    result.devices = subs.length
    if (subs.length === 0) return result

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
        // urgency high — иначе Android в режиме экономии (Doze) придерживает
        // «обычные» пуши до пробуждения экрана.
        { TTL: 24 * 3600, urgency: 'high' },
      )),
    )
    // Чистим мёртвые подписки (устройство отписалось/переустановило браузер).
    const dead: string[] = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') { result.sent++; return }
      const code = (r.reason as { statusCode?: number })?.statusCode ?? 0
      result.failed.push(code)
      if (code === 404 || code === 410) dead.push(subs[i].endpoint)
      else console.error('[push] send:', code, (r.reason as { body?: string })?.body ?? r.reason)
    })
    if (dead.length > 0) {
      const alive = subs.filter(s => !dead.includes(s.endpoint))
      await setAppSetting(subsKey(personId), alive, personId)
    }
  } catch (e) {
    console.error('[push] sendPushToPerson:', e)
  }
  return result
}
