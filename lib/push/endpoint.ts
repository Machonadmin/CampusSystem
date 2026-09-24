// ─── Проверка адреса push-подписки ───────────────────────────────────────────
//
// Сервер сам делает POST на endpoint подписки (web-push). Раньше endpoint
// принимался любой, и любой вошедший пользователь мог сохранить, например,
// http://169.254.169.254/... или адрес внутреннего сервиса — сервер стучался
// бы туда от своего имени (SSRF). Теперь принимаем только https-адреса
// настоящих push-сервисов браузеров.

const PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com',         // Chrome, Edge (Android), Samsung Internet, Opera
  'android.googleapis.com',     // старые подписки Chrome
  'push.services.mozilla.com',  // Firefox
  'notify.windows.com',         // Edge на Windows (WNS)
  'push.apple.com',             // Safari / iPhone (web.push.apple.com)
]

const MAX_ENDPOINT_LENGTH = 2048
const MAX_KEY_LENGTH = 256

function hostAllowed(host: string): boolean {
  return PUSH_HOST_SUFFIXES.some(s => host === s || host.endsWith(`.${s}`))
}

/** endpoint — https-адрес известного push-сервиса без порта и логина. */
export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LENGTH) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false
  return hostAllowed(url.hostname.toLowerCase())
}

/** Ключи подписки — непустые base64url-строки разумной длины. */
export function isValidPushKey(key: unknown): key is string {
  return typeof key === 'string' && key.length > 0 && key.length <= MAX_KEY_LENGTH && /^[A-Za-z0-9_=-]+$/.test(key)
}
