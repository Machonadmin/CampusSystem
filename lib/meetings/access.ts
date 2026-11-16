import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionPayload } from '@/lib/auth/jwt'
import { createServerClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/supabase/errors'
import { todayISO } from '@/lib/dates'
import { deriveDelegations } from './people'
import { meetingVisibility, type MeetingRelation, type MeetingRow, type MeetingVisibility } from './rules'

// ─── פגישות המנהל: доступ (читает БД) ───────────────────────────────────────
//
// Модель прав — по людям, не по должностям (как вся система после 17.09):
//   • владелец календаря — тот, чей provider_id у встречи;
//   • מזכירת המנהל — тот, кто записан в calendar_delegates для этого владельца.
//     Записывает её сам владелец (или superadmin) на экране «פגישות» → «הגדרות».
//   • содержание конкретной встречи — тем, кого владелец выбрал в
//     appointment_content_viewers. По умолчанию — никому.
// Новые таблицы ещё не в сгенерированных типах — работаем через db().

type SB = SupabaseClient | ReturnType<typeof createServerClient>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function db(sb: SB): any {
  return sb
}

export const MEETING_COLS =
  'id, provider_id, journey_id, title, reason, notes, summary, private_note, prep_notes, starts_at, ends_at, status'

/** Название должности секретаря в справочнике reference_positions. */
export const SECRETARY_POSITION_HE = 'מזכירת המנהל'

export interface Delegation { owner_id: string; delegate_id: string; auto: boolean }

/** Записанные вручную назначения (экран «מי מנהל את היומן»). */
async function manualDelegations(sb: SB): Promise<Delegation[]> {
  const { data, error } = await db(sb).from('calendar_delegates').select('owner_id, delegate_id')
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return ((data ?? []) as Array<{ owner_id: string; delegate_id: string }>).map(r => ({ ...r, auto: false }))
}

/**
 * Автоматические назначения по должности (решение владельца 16.11.2026):
 * у кого действующая должность «מזכירת המנהל» в подразделении — та ведёт
 * календарь руководителя этого подразделения (staff_positions.is_head).
 * Служебные read-only учётные записи руководителями не считаются.
 */
async function autoDelegations(sb: SB): Promise<Delegation[]> {
  const { data: pos } = await db(sb).from('reference_positions').select('id').eq('name_he', SECRETARY_POSITION_HE)
  const posIds = ((pos ?? []) as Array<{ id: string }>).map(r => r.id)
  if (posIds.length === 0) return []
  const today = todayISO()
  const { data: secs } = await db(sb).from('staff_positions').select('person_id, department_id, end_date').in('position_id', posIds)
  const secretaries = ((secs ?? []) as Array<{ person_id: string; department_id: string; end_date: string | null }>)
    .filter(r => r.end_date === null || r.end_date > today)
  if (secretaries.length === 0) return []
  const deptIds = [...new Set(secretaries.map(r => r.department_id))]
  const { data: hd } = await db(sb).from('staff_positions').select('person_id, department_id, end_date').eq('is_head', true).in('department_id', deptIds)
  const heads = ((hd ?? []) as Array<{ person_id: string; department_id: string; end_date: string | null }>)
    .filter(r => r.end_date === null || r.end_date > today)
  const headIds = [...new Set(heads.map(h => h.person_id))]
  let readOnly: string[] = []
  if (headIds.length > 0) {
    const { data: ro } = await db(sb).from('person_accounts').select('person_id').in('person_id', headIds).eq('read_only', true)
    readOnly = ((ro ?? []) as Array<{ person_id: string }>).map(r => r.person_id)
  }
  return deriveDelegations(secretaries, heads, readOnly).map(d => ({ ...d, auto: true }))
}

/** Все назначения: ручные + по должности (ручное важнее, дубли убраны). */
export async function allDelegations(sb: SB): Promise<Delegation[]> {
  const [manual, auto] = await Promise.all([manualDelegations(sb), autoDelegations(sb)])
  const seen = new Set(manual.map(d => `${d.owner_id}|${d.delegate_id}`))
  return [...manual, ...auto.filter(d => !seen.has(`${d.owner_id}|${d.delegate_id}`))]
}

/** Владельцы, чей календарь ведёт этот человек. */
export async function managedOwnerIds(sb: SB, personId: string): Promise<string[]> {
  return [...new Set((await allDelegations(sb)).filter(d => d.delegate_id === personId).map(d => d.owner_id))]
}

/** Кто ведёт календарь владельца. */
export async function delegateIdsOf(sb: SB, ownerId: string): Promise<string[]> {
  return [...new Set((await allDelegations(sb)).filter(d => d.owner_id === ownerId).map(d => d.delegate_id))]
}

/** Отношение к календарю владельца: свой, веду его, или никакого. */
export async function canManageCalendar(sb: SB, session: SessionPayload, ownerId: string): Promise<'owner' | 'delegate' | null> {
  if (session.principal === 'student') return null
  if (ownerId === session.person_id) return 'owner'
  return (await managedOwnerIds(sb, session.person_id)).includes(ownerId) ? 'delegate' : null
}

/** Те, кому можно отправить заявку на встречу: владельцы с секретарём. */
export async function requestTargetIds(sb: SB): Promise<string[]> {
  return [...new Set((await allDelegations(sb)).map(d => d.owner_id))]
}

export async function personNames(sb: SB, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))]
  const out = new Map<string, string>()
  if (uniq.length === 0) return out
  const { data } = await db(sb).from('persons').select('id, full_name, hebrew_name').in('id', uniq)
  for (const p of (data ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null }>) {
    out.set(p.id, (p.hebrew_name || p.full_name || '').trim())
  }
  return out
}

export interface LoadedMeeting {
  row: MeetingRow
  relation: MeetingRelation
  visibility: MeetingVisibility
}

/**
 * Встреча + что этому человеку в ней положено. null — встречи нет ИЛИ человеку
 * её не видно (не отличаем, чтобы не подсказывать, что id существует).
 */
export async function loadMeeting(sb: SB, session: SessionPayload, id: string): Promise<LoadedMeeting | null> {
  if (session.principal === 'student') return null
  const { data, error } = await db(sb).from('appointments').select(MEETING_COLS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as MeetingRow
  const isOwner = row.provider_id === session.person_id
  const isDelegate = !isOwner && (await managedOwnerIds(sb, session.person_id)).includes(row.provider_id)
  let isContentViewer = false
  if (!isOwner) {
    const { data: v, error: vErr } = await db(sb).from('appointment_content_viewers')
      .select('person_id').eq('appointment_id', id).eq('person_id', session.person_id).maybeSingle()
    if (vErr && !isMissingTable(vErr)) throw vErr
    isContentViewer = !!v
  }
  const relation = { isOwner, isDelegate, isContentViewer }
  const visibility = meetingVisibility(relation)
  if (!visibility.basic) return null
  return { row, relation, visibility }
}
