import { createServerClient } from '@/lib/supabase/server'
import { isMissingColumn } from '@/lib/supabase/errors'
import { classifyPersonMatch, findPersonCandidates } from '@/lib/persons/match'
import { insertBarePerson } from '@/lib/persons/create'
import { maskPhone } from '@/lib/persons/redact'
import { hasPersonsPrivilege } from '@/lib/persons/permissions'
import type { SessionPayload } from '@/lib/auth/jwt'

type SB = ReturnType<typeof createServerClient>

/**
 * Решение №11: связь контакта (contacts) / донора (sponsors) с центральной
 * персоной (persons). Колонки person_id / person_link_status /
 * suggested_person_id добавляет миграция 20260925000000_contacts_sponsors_person_link.sql.
 *
 * ДЕПЛОЙ-БЕЗОПАСНО: пока миграция не применена (42703 / PGRST204), всё здесь
 * молча становится no-op ('skipped' / null) и НИКОГДА не роняет сохранение.
 *
 * Связь только для отображения: правка телефона/почты записи НЕ копируется в
 * persons. Организации никогда не сопоставляются и не создаются как персоны.
 */

export type PersonLinkTable = 'contacts' | 'sponsors'
export type PersonLinkStatus = 'linked' | 'suggested' | 'rejected'
export type PersonLinkAction = 'confirm' | 'reject' | 'unlink'

/** То, что уходит клиенту: без сырых id кандидата — только имя + маска телефона. */
export interface PersonLinkView {
  status: PersonLinkStatus | null
  /** Связанная персона — только если у зрителя есть persons.view. */
  person: { id: string; name: string } | null
  /** Кандидат «возможное совпадение» — только для держателей *.manage. */
  candidate: { name: string; phone_masked: string | null } | null
}

export interface PersonLinkResult extends PersonLinkView {
  outcome: 'linked' | 'suggested' | 'created' | 'skipped'
  reason?: 'organization' | 'not_migrated' | 'already_decided' | 'error'
}

export interface ViewerFlags {
  canManage: boolean
  canViewPersons: boolean
}

export const PERSON_LINK_COLS = 'person_id, person_link_status, suggested_person_id'

export interface RawLinkCols {
  person_id?: string | null
  person_link_status?: string | null
  suggested_person_id?: string | null
}

const TYPE_COL: Record<PersonLinkTable, 'contact_type' | 'sponsor_type'> = {
  contacts: 'contact_type',
  sponsors: 'sponsor_type',
}

/** Организации не связываются: contacts.contact_type='organization', sponsors.sponsor_type<>'individual'. */
export function isOrganizationRecord(table: PersonLinkTable, typeValue: string | null | undefined): boolean {
  if (table === 'contacts') return typeValue === 'organization'
  return typeValue !== 'individual'
}

function asStatus(v: unknown): PersonLinkStatus | null {
  return v === 'linked' || v === 'suggested' || v === 'rejected' ? v : null
}

interface PersonBrief { name: string; phone: string | null }

function firstPhone(phones: unknown): string | null {
  if (!Array.isArray(phones) || phones.length === 0) return null
  const p = phones[0]
  if (p && typeof p === 'object' && 'number' in p) return String((p as { number: unknown }).number ?? '') || null
  return typeof p === 'string' ? p : null
}

async function loadPersonsBrief(sb: SB, ids: string[]): Promise<Map<string, PersonBrief>> {
  const out = new Map<string, PersonBrief>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return out
  const CHUNK = 200
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await sb
      .from('persons')
      .select('id, full_name, hebrew_name, phones')
      .in('id', unique.slice(i, i + CHUNK))
    if (error) return out
    for (const r of (data ?? []) as Array<{ id: string; full_name: string | null; hebrew_name: string | null; phones: unknown }>) {
      out.set(r.id, { name: r.full_name || r.hebrew_name || '—', phone: firstPhone(r.phones) })
    }
  }
  return out
}

function buildView(raw: RawLinkCols, persons: Map<string, PersonBrief>, viewer: ViewerFlags): PersonLinkView {
  const status = asStatus(raw.person_link_status)
  let person: PersonLinkView['person'] = null
  if (status === 'linked' && raw.person_id && viewer.canViewPersons) {
    const p = persons.get(raw.person_id)
    person = { id: raw.person_id, name: p?.name ?? '—' }
  }
  let candidate: PersonLinkView['candidate'] = null
  if (status === 'suggested' && raw.suggested_person_id && viewer.canManage) {
    const p = persons.get(raw.suggested_person_id)
    if (p) candidate = { name: p.name, phone_masked: maskPhone(p.phone) }
  }
  return { status, person, candidate }
}

function idsToLoad(raws: RawLinkCols[], viewer: ViewerFlags): string[] {
  const ids: string[] = []
  for (const r of raws) {
    const s = asStatus(r.person_link_status)
    if (s === 'linked' && r.person_id && viewer.canViewPersons) ids.push(r.person_id)
    if (s === 'suggested' && r.suggested_person_id && viewer.canManage) ids.push(r.suggested_person_id)
  }
  return ids
}

/**
 * Заменяет сырые колонки связи в строках списка на person_link (PersonLinkView).
 * Строки без колонок (миграция не применена) получают person_link = null.
 */
export async function attachPersonLinks<T extends RawLinkCols>(
  sb: SB,
  rows: T[],
  viewer: ViewerFlags,
  migrated: boolean,
): Promise<Array<Omit<T, keyof RawLinkCols> & { person_link: PersonLinkView | null }>> {
  const strip = (r: T) => {
    const { person_id: _a, person_link_status: _b, suggested_person_id: _c, ...rest } = r
    return rest
  }
  if (!migrated) return rows.map(r => ({ ...strip(r), person_link: null }))
  const persons = await loadPersonsBrief(sb, idsToLoad(rows, viewer))
  return rows.map(r => ({ ...strip(r), person_link: buildView(r, persons, viewer) }))
}

/** Текущее состояние связи одной записи или null (записи нет / миграция не применена). */
export async function loadRecordPersonLink(
  sb: SB,
  table: PersonLinkTable,
  id: string,
  viewer: ViewerFlags,
): Promise<PersonLinkView | null> {
  try {
    const { data, error } = await sb.from(table).select(PERSON_LINK_COLS).eq('id', id).maybeSingle()
    if (error || !data) return null
    const raw = data as unknown as RawLinkCols
    const persons = await loadPersonsBrief(sb, idsToLoad([raw], viewer))
    return buildView(raw, persons, viewer)
  } catch {
    return null
  }
}

const EMPTY_VIEW: PersonLinkView = { status: null, person: null, candidate: null }

/**
 * Авто-связывание после создания/правки записи. Best-effort: НИКОГДА не бросает.
 *   • организация                        → skipped (organization);
 *   • колонок ещё нет                    → skipped (not_migrated);
 *   • уже linked / rejected              → skipped (already_decided), состояние как есть;
 *   • телефон/email + имя совпали (1 канд.) → linked;
 *   • совпадение неуверенное               → suggested (suggested_person_id);
 *   • совпадений нет                     → создаётся персона (name/phone/email) и linked.
 * Вызывающий — держатель *.manage, поэтому кандидат в ответе показывается.
 */
export async function autoLinkRecordToPerson(
  sb: SB,
  table: PersonLinkTable,
  id: string,
  viewer: { canViewPersons: boolean },
): Promise<PersonLinkResult> {
  const flags: ViewerFlags = { canManage: true, canViewPersons: viewer.canViewPersons }
  try {
    const typeCol = TYPE_COL[table]
    const { data, error } = await sb
      .from(table)
      .select(`id, name, email, phone, ${typeCol}, ${PERSON_LINK_COLS}`)
      .eq('id', id)
      .maybeSingle()
    if (error) {
      return { ...EMPTY_VIEW, outcome: 'skipped', reason: isMissingColumn(error) ? 'not_migrated' : 'error' }
    }
    if (!data) return { ...EMPTY_VIEW, outcome: 'skipped', reason: 'error' }
    const row = data as unknown as RawLinkCols & {
      id: string; name: string; email: string | null; phone: string | null
      contact_type?: string | null; sponsor_type?: string | null
    }

    const current = async (): Promise<PersonLinkView> => {
      const persons = await loadPersonsBrief(sb, idsToLoad([row], flags))
      return buildView(row, persons, flags)
    }

    if (isOrganizationRecord(table, row[typeCol])) {
      return { ...(await current()), outcome: 'skipped', reason: 'organization' }
    }
    const status = asStatus(row.person_link_status)
    if (status === 'linked' || status === 'rejected') {
      return { ...(await current()), outcome: 'skipped', reason: 'already_decided' }
    }

    const input = { name: row.name, email: row.email, phone: row.phone }
    const { candidates, error: candErr } = await findPersonCandidates(sb, input)
    if (candErr) return { ...(await current()), outcome: 'skipped', reason: 'error' }

    const cls = classifyPersonMatch(input, candidates)
    let patch: RawLinkCols
    let outcome: PersonLinkResult['outcome']
    if (cls.kind === 'linked') {
      patch = { person_id: cls.person_id, person_link_status: 'linked', suggested_person_id: null }
      outcome = 'linked'
    } else if (cls.kind === 'suggested') {
      patch = { person_id: null, person_link_status: 'suggested', suggested_person_id: cls.person_id }
      outcome = 'suggested'
    } else {
      const name = row.name.trim()
      if (!name) return { ...(await current()), outcome: 'skipped', reason: 'error' }
      // persons строго требует только first_name — кладём туда имя целиком
      // (как быстрое добавление с full_name в POST /api/persons).
      const { data: created, error: createErr } = await insertBarePerson(sb, {
        first_name: name, email: row.email, phone: row.phone,
      })
      if (createErr || !created) return { ...(await current()), outcome: 'skipped', reason: 'error' }
      patch = { person_id: (created as { id: string }).id, person_link_status: 'linked', suggested_person_id: null }
      outcome = 'created'
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await sb.from(table).update(patch as any).eq('id', id)
    if (updErr) {
      return { ...(await current()), outcome: 'skipped', reason: isMissingColumn(updErr) ? 'not_migrated' : 'error' }
    }
    const next = { ...row, ...patch }
    const persons = await loadPersonsBrief(sb, idsToLoad([next], flags))
    return { ...buildView(next, persons, flags), outcome }
  } catch {
    return { ...EMPTY_VIEW, outcome: 'skipped', reason: 'error' }
  }
}

/** persons.view зрителя; сбой проверки прав → false (связанная персона просто не показывается). */
export async function canViewPersonsSafe(session: SessionPayload | null): Promise<boolean> {
  try {
    return await hasPersonsPrivilege(session, 'view')
  } catch {
    return false
  }
}

export function isPersonLinkAction(v: unknown): v is PersonLinkAction {
  return v === 'confirm' || v === 'reject' || v === 'unlink'
}

/**
 * Решение ответственного по записи:
 *   • confirm — только из 'suggested': person_id ← suggested_person_id, 'linked';
 *   • reject  — только из 'suggested': «не тот же человек» → 'rejected', кандидат снят;
 *   • unlink  — только из 'linked': связь снята, статус 'rejected' (чтобы
 *     следующая правка записи не связала её автоматически обратно).
 */
export async function applyPersonLinkAction(
  sb: SB,
  table: PersonLinkTable,
  id: string,
  action: PersonLinkAction,
  viewer: ViewerFlags,
): Promise<{ view: PersonLinkView } | { error: 'not_found' | 'state_conflict' | 'not_migrated' | 'db'; dbError?: { code?: string; message?: string } }> {
  const { data, error } = await sb.from(table).select(`id, ${PERSON_LINK_COLS}`).eq('id', id).maybeSingle()
  if (error) return isMissingColumn(error) ? { error: 'not_migrated' } : { error: 'db', dbError: error }
  if (!data) return { error: 'not_found' }
  const row = data as unknown as RawLinkCols
  const status = asStatus(row.person_link_status)

  let patch: RawLinkCols
  if (action === 'confirm') {
    if (status !== 'suggested' || !row.suggested_person_id) return { error: 'state_conflict' }
    patch = { person_id: row.suggested_person_id, person_link_status: 'linked', suggested_person_id: null }
  } else if (action === 'reject') {
    if (status !== 'suggested') return { error: 'state_conflict' }
    patch = { person_id: null, person_link_status: 'rejected', suggested_person_id: null }
  } else {
    if (status !== 'linked' || !row.person_id) return { error: 'state_conflict' }
    patch = { person_id: null, person_link_status: 'rejected', suggested_person_id: null }
  }

  // Оптимистичная защита от гонки: обновляем только если статус не изменился.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: upd, error: updErr } = await sb.from(table).update(patch as any)
    .eq('id', id).eq('person_link_status', status as string)
    .select('id')
  if (updErr) return isMissingColumn(updErr) ? { error: 'not_migrated' } : { error: 'db', dbError: updErr }
  if (!upd || upd.length === 0) return { error: 'state_conflict' }

  const next = { ...row, ...patch }
  const persons = await loadPersonsBrief(sb, idsToLoad([next], viewer))
  return { view: buildView(next, persons, viewer) }
}
