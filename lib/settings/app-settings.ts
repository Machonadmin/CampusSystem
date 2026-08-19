import { createServerClient } from '@/lib/supabase/server'

// ─── Глобальные настройки приложения (app_settings) ─────────────────────────
//
// Одно-организационное приложение ⇒ «уровень организации» = глобально.
// Значение хранится как JSONB; читаем на сервере с fallback.

export type SignatureMethod = 'typed' | 'drawn' | 'both'

export function isSignatureMethod(v: unknown): v is SignatureMethod {
  return v === 'typed' || v === 'drawn' || v === 'both'
}

/** Читает настройку по ключу; при отсутствии/ошибке возвращает fallback. */
export async function getAppSetting<T>(key: string, fallback: T): Promise<T> {
  const sb = createServerClient()
  const { data, error } = await sb
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error || !data) return fallback
  return (data.value as T) ?? fallback
}

/** Метод подписи: 'typed' | 'drawn' | 'both'. По умолчанию 'both'. */
export async function getSignatureMethod(): Promise<SignatureMethod> {
  const v = await getAppSetting<unknown>('signature_method', 'both')
  return isSignatureMethod(v) ? v : 'both'
}

/** Записывает настройку (upsert). updatedBy — person_id администратора. */
export async function setAppSetting(key: string, value: unknown, updatedBy: string): Promise<void> {
  const sb = createServerClient()
  const { error } = await sb
    .from('app_settings')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert({ key, value: value as any, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw Object.assign(new Error(error.message), { status: 500 })
}
