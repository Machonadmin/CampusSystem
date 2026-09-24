import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { isMissingColumn } from '@/lib/supabase/errors'

// ─── Блокировка аккаунта после неудачных входов ──────────────────────────────
//
// Лимит по IP (login-throttle.ts) живёт в памяти одного инстанса и не мешает
// перебирать пароль одного человека с многих адресов. Поэтому счётчик неудач
// хранится в самой строке аккаунта (миграция 20260924090000):
//   • failed_login_count — неудачи подряд с последнего успешного входа;
//   • locked_until       — до этого момента вход закрыт даже с верным паролем.
// После MAX_FAILED_LOGINS неудач подряд вход закрывается на LOCK_MINUTES,
// счётчик обнуляется. Успешный вход и сброс пароля администратором снимают всё.
//
// Для адресов, которых нет в системе, такой же счётчик ведётся в памяти: иначе
// «слишком много попыток» появлялось бы только у существующих адресов, и по
// этому ответу можно было бы узнать, какие адреса в системе есть.
//
// Deploy-safe: пока колонок нет, аккаунт читается без них и ничего не пишется.

export const MAX_FAILED_LOGINS = 10
export const LOCK_MINUTES = 15
const LOCK_MS = LOCK_MINUTES * 60 * 1000

export type LoginTable = 'person_accounts' | 'student_credentials'

export interface LockoutFields {
  failed_login_count?: number | null
  locked_until?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>

const LOCKOUT_COLS = 'failed_login_count, locked_until'

/**
 * Строка аккаунта для входа вместе с полями блокировки (если колонки уже есть).
 * Колонок ещё нет → читаем без них. Ошибка базы → { row: null, error }.
 */
export async function selectLoginRow<T>(
  table: LoginTable,
  baseCols: string,
  loginEmail: string,
): Promise<{ row: (T & LockoutFields) | null; error: unknown }> {
  const sb = createServerClient() as unknown as AnyClient
  const run = (cols: string) => sb.from(table).select(cols).eq('login_email', loginEmail).maybeSingle()
  let res = await run(`${baseCols}, ${LOCKOUT_COLS}`)
  if (res.error && isMissingColumn(res.error)) res = await run(baseCols)
  if (res.error) return { row: null, error: res.error }
  return { row: (res.data as (T & LockoutFields) | null) ?? null, error: null }
}

/** Секунд до конца блокировки; 0 — вход открыт. */
export function lockedForSec(row: LockoutFields | null | undefined, now = Date.now()): number {
  if (!row?.locked_until) return 0
  const until = Date.parse(row.locked_until)
  if (Number.isNaN(until) || until <= now) return 0
  return Math.ceil((until - now) / 1000)
}

/** Изменения строки после ещё одной неудачи. */
export function nextFailureState(row: LockoutFields, now = Date.now()): { failed_login_count: number; locked_until?: string } {
  const count = (row.failed_login_count ?? 0) + 1
  if (count >= MAX_FAILED_LOGINS) {
    return { failed_login_count: 0, locked_until: new Date(now + LOCK_MS).toISOString() }
  }
  return { failed_login_count: count }
}

function hasLockoutColumns(row: LockoutFields): boolean {
  return 'failed_login_count' in row
}

/** Неверный пароль для существующего аккаунта. Best-effort: никогда не бросает. */
export async function recordFailedLogin(table: LoginTable, loginEmail: string, row: LockoutFields): Promise<void> {
  if (!hasLockoutColumns(row)) return
  try {
    const sb = createServerClient() as unknown as AnyClient
    const { error } = await sb.from(table).update(nextFailureState(row)).eq('login_email', loginEmail)
    if (error && !isMissingColumn(error)) console.error('[auth] lockout write failed:', error.message)
  } catch (err) {
    console.error('[auth] lockout write failed:', (err as { message?: string })?.message ?? err)
  }
}

/** Успешный вход: обнулить счётчик, если там что-то есть. Best-effort. */
export async function recordSuccessfulLogin(table: LoginTable, loginEmail: string, row: LockoutFields): Promise<void> {
  if (!hasLockoutColumns(row) || (!row.failed_login_count && !row.locked_until)) return
  try {
    const sb = createServerClient() as unknown as AnyClient
    await sb.from(table).update({ failed_login_count: 0, locked_until: null }).eq('login_email', loginEmail)
  } catch { /* не критично: счётчик обнулится при следующем успешном входе */ }
}

/**
 * Снять блокировку (сброс пароля администратором). Deploy-safe: до миграции
 * колонок нет — пропускаем.
 */
export async function clearLoginLockout(table: LoginTable, column: 'id' | 'person_id' | 'journey_id', value: string): Promise<void> {
  const sb = createServerClient() as unknown as AnyClient
  const { error } = await sb.from(table).update({ failed_login_count: 0, locked_until: null }).eq(column, value)
  if (error && !isMissingColumn(error)) throw error
}

// ─── Адреса, которых нет в системе (в памяти инстанса) ───────────────────────

const unknownFailures = new Map<string, { count: number; lockedUntil: number }>()
const UNKNOWN_MAX_ENTRIES = 10_000

/** Секунд до конца «блокировки» несуществующего адреса; 0 — не заблокирован. */
export function unknownLockedForSec(key: string, now = Date.now()): number {
  const hit = unknownFailures.get(key)
  if (!hit || hit.lockedUntil <= now) return 0
  return Math.ceil((hit.lockedUntil - now) / 1000)
}

export function recordUnknownFailure(key: string, now = Date.now()): void {
  if (unknownFailures.size >= UNKNOWN_MAX_ENTRIES) unknownFailures.clear()
  const hit = unknownFailures.get(key) ?? { count: 0, lockedUntil: 0 }
  if (hit.lockedUntil && hit.lockedUntil <= now) hit.lockedUntil = 0
  hit.count += 1
  if (hit.count >= MAX_FAILED_LOGINS) {
    hit.count = 0
    hit.lockedUntil = now + LOCK_MS
  }
  unknownFailures.set(key, hit)
}

/** Для тестов. */
export function clearUnknownFailures(): void {
  unknownFailures.clear()
}
