import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { isMissingColumn } from '@/lib/supabase/errors'
import type { SessionPayload } from './jwt'

// ─── Живая проверка сессии ───────────────────────────────────────────────────
//
// JWT живёт 7 дней и сам по себе не знает, что за это время случилось с
// аккаунтом. Раньше это значило: сотрудника отключили, сняли с него роль или
// сменили ему пароль — а его браузер (или украденная кука) ещё до 7 дней
// работал со старыми правами, включая superadmin.
//
// Теперь getSession() сверяет токен с базой:
//   • сотрудник — строка person_accounts (person_id + login_email) существует и
//     is_active; роли берутся ТЕКУЩИЕ из person_roles, а не из токена;
//   • студентка — student_credentials её journey активна, journey всё ещё
//     'student' (то же правило, что при входе в портал);
//   • режим «צפייה כמשתמש» — тот, кто смотрит (imp_by), всё ещё активный
//     superadmin;
//   • sessions_valid_after (миграция 20260923210000): токен, выписанный раньше
//     этой отметки, недействителен. Её ставят смена и сброс пароля — так
//     выход происходит на всех остальных устройствах.
//
// Результат кэшируется на CACHE_TTL_MS в памяти инстанса: изменения доходят
// максимум за это время, а база не получает запрос на каждый вызов getSession
// (их бывает несколько на один запрос).
//
// Deploy-safe: пока колонки sessions_valid_after нет, проверяются только
// is_active/роли. При сбое самой базы проверка пропускается (fail-open) — иначе
// короткий сбой Supabase разлогинил бы всех; подделать такой сбой снаружи нельзя.

const CACHE_TTL_MS = 30_000

/** Что знаем о сессии из базы. valid=false — токен больше не принимается. */
export interface LiveSessionState {
  valid: boolean
  /** Текущие роли сотрудника (для студентки — всегда []). */
  roles?: string[]
}

interface CacheEntry {
  state: Promise<LiveSessionState>
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>

function cacheKey(s: SessionPayload): string {
  const valid = typeof s.iat === 'number' ? s.iat : 0
  return [s.principal ?? 'staff', s.person_id, s.login_email, s.student_journey_id ?? '', s.imp_by ?? '', valid].join('|')
}

/** Сбросить кэш (после смены пароля/ролей в этом же инстансе, и в тестах). */
export function clearLiveSessionCache(personId?: string): void {
  if (!personId) { cache.clear(); return }
  for (const key of cache.keys()) {
    if (key.split('|')[1] === personId) cache.delete(key)
  }
}

/**
 * Токен выписан не раньше отметки sessions_valid_after? iat в секундах, отметка —
 * с миллисекундами: сравниваем по целым секундам, чтобы токен, выписанный сразу
 * после смены пароля (в ту же секунду), оставался действительным.
 */
export function issuedAfter(iat: number | undefined, validAfter: string | null | undefined): boolean {
  if (!validAfter) return true
  const after = Date.parse(validAfter)
  if (Number.isNaN(after)) return true
  return (iat ?? 0) >= Math.floor(after / 1000)
}

async function loadRoles(sb: AnyClient, personId: string): Promise<string[]> {
  const { data: prRows, error } = await sb.from('person_roles').select('role_id').eq('person_id', personId)
  if (error) throw error
  const roleIds = ((prRows ?? []) as { role_id: string }[]).map(r => r.role_id)
  if (roleIds.length === 0) return []
  const { data: roleRows, error: rErr } = await sb.from('roles').select('code').in('id', roleIds)
  if (rErr) throw rErr
  return ((roleRows ?? []) as { code: string }[]).map(r => r.code)
}

/**
 * Строка аккаунта с is_active и (если колонка уже есть) sessions_valid_after.
 * Колонки ещё нет → читаем без неё.
 */
async function selectWithValidAfter(
  run: (cols: string) => PromiseLike<{ data: unknown; error: unknown }>,
  baseCols: string,
): Promise<Record<string, unknown> | null> {
  let res = await run(`${baseCols}, sessions_valid_after`)
  if (res.error && isMissingColumn(res.error)) res = await run(baseCols)
  if (res.error) throw res.error
  return (res.data as Record<string, unknown> | null) ?? null
}

async function staffAccount(sb: AnyClient, personId: string, loginEmail: string | null) {
  return selectWithValidAfter(cols => {
    let q = sb.from('person_accounts').select(cols).eq('person_id', personId)
    if (loginEmail !== null) q = q.eq('login_email', loginEmail)
    return q.limit(1).maybeSingle()
  }, 'is_active')
}

async function loadState(s: SessionPayload): Promise<LiveSessionState> {
  const sb = createServerClient() as unknown as AnyClient

  if (s.principal === 'student') {
    if (!s.student_journey_id) return { valid: false }
    const cred = await selectWithValidAfter(
      cols => sb.from('student_credentials').select(cols).eq('journey_id', s.student_journey_id!).maybeSingle(),
      'person_id, is_active',
    )
    if (!cred || cred.is_active !== true || cred.person_id !== s.person_id) return { valid: false }
    if (!issuedAfter(s.iat, cred.sessions_valid_after as string | null | undefined)) return { valid: false }
    const { data: journey, error } = await sb.from('education_journeys')
      .select('education_status').eq('id', s.student_journey_id).maybeSingle()
    if (error) throw error
    if ((journey as { education_status?: string } | null)?.education_status !== 'student') return { valid: false }
    return { valid: true, roles: [] }
  }

  if (s.imp_by) {
    // Смотрит superadmin: его собственный аккаунт должен быть активен, а роль
    // superadmin — всё ещё при нём. login_email смотрящего в токене нет.
    const viewer = await staffAccount(sb, s.imp_by, null)
    if (!viewer || viewer.is_active !== true) return { valid: false }
    if (!issuedAfter(s.iat, viewer.sessions_valid_after as string | null | undefined)) return { valid: false }
    if (!(await loadRoles(sb, s.imp_by)).includes('superadmin')) return { valid: false }
    // Смотрим глазами человека — с его ТЕКУЩИМИ ролями.
    return { valid: true, roles: await loadRoles(sb, s.person_id) }
  }

  const account = await staffAccount(sb, s.person_id, s.login_email)
  if (!account || account.is_active !== true) return { valid: false }
  if (!issuedAfter(s.iat, account.sessions_valid_after as string | null | undefined)) return { valid: false }
  return { valid: true, roles: await loadRoles(sb, s.person_id) }
}

/**
 * Сверить расшифрованный токен с базой. Возвращает сессию с текущими ролями
 * или null, если аккаунт отключён, пароль с тех пор меняли и т.п.
 */
export async function checkLiveSession(s: SessionPayload): Promise<SessionPayload | null> {
  // dev-login (только NODE_ENV=development) выписывает токен без аккаунта в базе.
  if (process.env.NODE_ENV === 'development' && s.login_email === 'dev@localhost') return s

  const key = cacheKey(s)
  const now = Date.now()
  let entry = cache.get(key)
  if (!entry || entry.expiresAt < now) {
    const state = loadState(s)
    entry = { state, expiresAt: now + CACHE_TTL_MS }
    cache.set(key, entry)
    // Сбой базы не кэшируем: следующий вызов попробует снова.
    state.catch(() => { if (cache.get(key) === entry) cache.delete(key) })
  }

  let state: LiveSessionState
  try {
    state = await entry.state
  } catch (err) {
    console.error('[auth] live session check failed, allowing token:', (err as { message?: string })?.message ?? err)
    return s
  }
  if (!state.valid) return null
  return state.roles ? { ...s, roles: state.roles } : s
}

/**
 * «Выйти на всех устройствах» для одного аккаунта: все токены, выписанные до
 * этой минуты, перестают приниматься. Вызывается при смене и сбросе пароля.
 * Вызвавший, если ему нужно остаться в системе, сразу выписывает себе новый
 * токен (createSession). Deploy-safe: до миграции колонки нет — пропускаем.
 *
 * @param table  'person_accounts' (сотрудник) или 'student_credentials' (портал)
 * @param column по какому полю искать строку ('id', 'person_id', 'journey_id')
 */
export async function revokeSessionsBefore(
  table: 'person_accounts' | 'student_credentials',
  column: 'id' | 'person_id' | 'journey_id',
  value: string,
): Promise<void> {
  const sb = createServerClient() as unknown as AnyClient
  const { data, error } = await sb.from(table)
    .update({ sessions_valid_after: new Date().toISOString() })
    .eq(column, value)
    .select('person_id')
  if (error) {
    if (isMissingColumn(error)) return
    throw error
  }
  for (const row of (data ?? []) as { person_id: string }[]) clearLiveSessionCache(row.person_id)
}
