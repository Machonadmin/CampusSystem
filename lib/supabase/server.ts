import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Server-side Supabase client using the service role key.
 * Bypasses Row Level Security — only use in trusted server contexts
 * (API routes, Server Actions, scripts). Never expose to the browser.
 */
export function createServerClient(options: { actorPersonId?: string | null } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY

  // Fail-closed в production: без service-role ключа НЕ откатываемся молча на
  // публичный anon-ключ. Раньше `SECRET ?? ANON` означало, что при отсутствии
  // секрета сервер тихо работал под анонимной ролью — а так как RLS выключен,
  // сбой был бы невидим (запросы всё равно проходят). Теперь при отсутствии
  // секрета в prod бросаем явную ошибку (fail loud), а не запускаемся уязвимо.
  // В dev/test разрешаем anon-фолбэк, чтобы не требовать секрет локально.
  const key = secret ?? (process.env.NODE_ENV === 'production' ? undefined : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

  if (!url || !key) {
    throw new Error(
      secret === undefined && process.env.NODE_ENV === 'production'
        ? 'SUPABASE_SECRET_KEY is required in production (refusing to fall back to the public anon key)'
        : 'Missing Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY)',
    )
  }

  // «Кто изменил» для журнала изменений (audit_log). PostgREST кладёт все
  // заголовки запроса в GUC request.headers на время ТОЙ ЖЕ транзакции, в
  // которой выполняется insert/update/delete, — поэтому триггер
  // audit_log_trigger() видит этот заголовок (миграция 20260924120000).
  // set_config из отдельного запроса так не работает: каждый запрос PostgREST
  // — своя транзакция. До миграции заголовок просто игнорируется БД.
  const actor = options.actorPersonId
  const headers: Record<string, string> =
    actor && UUID_RE.test(actor) ? { [AUDIT_ACTOR_HEADER]: actor } : {}

  return createClient<Database>(url, key, {
    auth: { persistSession: false },
    ...(Object.keys(headers).length > 0 ? { global: { headers } } : {}),
  })
}

/** Имя заголовка, из которого триггер аудита берёт автора изменения. */
export const AUDIT_ACTOR_HEADER = 'x-campus-actor-id'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
