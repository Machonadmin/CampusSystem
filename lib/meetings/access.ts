import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionPayload } from '@/lib/auth/jwt'
import { createServerClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/supabase/errors'
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

/** Владельцы, чей календарь ведёт этот человек. */
export async function managedOwnerIds(sb: SB, personId: string): Promise<string[]> {
  const { data, error } = await db(sb).from('calendar_delegates').select('owner_id').eq('delegate_id', personId)
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return [...new Set(((data ?? []) as Array<{ owner_id: string }>).map(r => r.owner_id))]
}

/** Кто ведёт календарь владельца. */
export async function delegateIdsOf(sb: SB, ownerId: string): Promise<string[]> {
  const { data, error } = await db(sb).from('calendar_delegates').select('delegate_id').eq('owner_id', ownerId)
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return ((data ?? []) as Array<{ delegate_id: string }>).map(r => r.delegate_id)
}

/** Отношение к календарю владельца: свой, веду его, или никакого. */
export async function canManageCalendar(sb: SB, session: SessionPayload, ownerId: string): Promise<'owner' | 'delegate' | null> {
  if (session.principal === 'student') return null
  if (ownerId === session.person_id) return 'owner'
  return (await managedOwnerIds(sb, session.person_id)).includes(ownerId) ? 'delegate' : null
}

/** Те, кому можно отправить заявку на встречу: владельцы с назначенным секретарём. */
export async function requestTargetIds(sb: SB): Promise<string[]> {
  const { data, error } = await db(sb).from('calendar_delegates').select('owner_id')
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return [...new Set(((data ?? []) as Array<{ owner_id: string }>).map(r => r.owner_id))]
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
