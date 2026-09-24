import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Server-side Supabase client using the service role key.
 * Bypasses Row Level Security — only use in trusted server contexts
 * (API routes, Server Actions, scripts). Never expose to the browser.
 */
export function createServerClient() {
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

  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  })
}
