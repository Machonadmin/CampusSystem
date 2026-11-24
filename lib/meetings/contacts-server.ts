import type { SessionPayload } from '@/lib/auth/jwt'
import { createServerClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/supabase/errors'
import { todayISO } from '@/lib/dates'
import { firstPhone } from '@/lib/persons/phone'
import { DOCUMENTS_BUCKET } from '@/lib/documents/storage'
import { loadProfilePhotoUrls } from '@/lib/persons/profile-photos-storage'
import { db, managedOwnerIds, delegateIdsOf } from './access'
import { addressBookRole, type AddressBookRole, type ContactGroup, type ContactKind } from './contacts'

// ─── ספר אנשי הקשר: чтение из БД (только сервер) ────────────────────────────

type SB = ReturnType<typeof createServerClient>

export interface ContactOut {
  kind: ContactKind
  id: string
  name: string
  phone: string | null
  email: string | null
  city: string | null
  department: string | null
  group_name: string | null
  year: string | null
  track: string | null
  position: string | null
  category: string | null
  photo_url: string | null
  /** Личный контакт: чей он (если не мой) и поделился ли я им. */
  owner_name?: string | null
  shared?: boolean
}

export interface AddressBookAccess {
  role: AddressBookRole | null
  isSuperadmin: boolean
  sharedWithMe: number
  migrated: boolean
}

export async function addressBookAccess(sb: SB, session: SessionPayload): Promise<AddressBookAccess> {
  const isSuperadmin = session.roles.includes('superadmin')
  const [managed, mine] = await Promise.all([
    managedOwnerIds(sb, session.person_id), delegateIdsOf(sb, session.person_id),
  ])
  const role = session.principal === 'student' ? null
    : addressBookRole({ isSuperadmin, hasDelegates: mine.length > 0, managesOthers: managed.length > 0 })
  const { count, error } = await db(sb).from('private_contact_shares').select('contact_id', { count: 'exact', head: true }).eq('person_id', session.person_id)
  if (error && !isMissingTable(error)) throw error
  return { role, isSuperadmin, sharedWithMe: count ?? 0, migrated: !error }
}

const nameOf = (r: { name_he?: string | null; name?: string | null } | null | undefined) =>
  r ? ((r.name_he || r.name || '').trim() || null) : null

interface PersonRow { id: string; full_name: string | null; hebrew_name: string | null; email: string | null; phones: unknown; address: unknown }
const PERSON_COLS = 'id, full_name, hebrew_name, email, phones, address'

export function personName(p: { full_name?: string | null; hebrew_name?: string | null }): string {
  return (p.hebrew_name || p.full_name || '').trim()
}

export function cityOf(address: unknown): string | null {
  if (!address || typeof address !== 'object') return null
  const c = (address as { city?: unknown }).city
  return typeof c === 'string' && c.trim() ? c.trim() : null
}

async function persons(sb: SB, ids: string[]): Promise<Map<string, PersonRow>> {
  const out = new Map<string, PersonRow>()
  const uniq = [...new Set(ids)]
  for (let i = 0; i < uniq.length; i += 300) {
    const { data, error } = await db(sb).from('persons').select(PERSON_COLS).in('id', uniq.slice(i, i + 300))
    if (error) throw error
    for (const p of (data ?? []) as PersonRow[]) out.set(p.id, p)
  }
  return out
}

async function names(sb: SB, table: string, ids: Array<string | null>): Promise<Map<string, string | null>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))]
  const out = new Map<string, string | null>()
  if (uniq.length === 0) return out
  const { data } = await db(sb).from(table).select('id, name, name_he').in('id', uniq)
  for (const r of (data ?? []) as Array<{ id: string; name: string | null; name_he: string | null }>) out.set(r.id, nameOf(r))
  return out
}

function base(kind: ContactKind, id: string, name: string): ContactOut {
  return {
    kind, id, name, phone: null, email: null, city: null, department: null, group_name: null,
    year: null, track: null, position: null, category: null, photo_url: null,
  }
}

function fromPerson(p: PersonRow): ContactOut {
  return { ...base('person', p.id, personName(p)), phone: firstPhone(p.phones), email: p.email || null, city: cityOf(p.address) }
}

async function students(sb: SB): Promise<ContactOut[]> {
  const { data, error } = await db(sb).from('education_journeys')
    .select('person_id, primary_department_id, main_group_id, specialty_id, year_level, opened_at')
    .eq('education_status', 'student').eq('is_deleted', false)
    .order('opened_at', { ascending: false })
  if (error) throw error
  const rows = (data ?? []) as Array<{ person_id: string; primary_department_id: string | null; main_group_id: string | null; specialty_id: string | null; year_level: number | null }>
  const seen = new Set<string>()
  const latest = rows.filter(r => (seen.has(r.person_id) ? false : (seen.add(r.person_id), true)))
  const [ps, deps, groups, specs] = await Promise.all([
    persons(sb, latest.map(r => r.person_id)),
    names(sb, 'departments', latest.map(r => r.primary_department_id)),
    names(sb, 'study_groups', latest.map(r => r.main_group_id)),
    names(sb, 'specialties', latest.map(r => r.specialty_id)),
  ])
  return latest.flatMap(r => {
    const p = ps.get(r.person_id)
    if (!p) return []
    return [{
      ...fromPerson(p),
      department: r.primary_department_id ? deps.get(r.primary_department_id) ?? null : null,
      group_name: r.main_group_id ? groups.get(r.main_group_id) ?? null : null,
      year: r.year_level != null ? String(r.year_level) : null,
      track: r.specialty_id ? specs.get(r.specialty_id) ?? null : null,
    }]
  })
}

async function staff(sb: SB): Promise<ContactOut[]> {
  const today = todayISO()
  const { data, error } = await db(sb).from('staff_positions').select('person_id, department_id, position_id, end_date')
  if (error) throw error
  const rows = ((data ?? []) as Array<{ person_id: string; department_id: string | null; position_id: string | null; end_date: string | null }>)
    .filter(r => r.end_date === null || r.end_date > today)
  const ids = [...new Set(rows.map(r => r.person_id))]
  if (ids.length === 0) return []
  const { data: ro } = await db(sb).from('person_accounts').select('person_id').in('person_id', ids).eq('read_only', true)
  const readOnly = new Set(((ro ?? []) as Array<{ person_id: string }>).map(r => r.person_id))
  const { data: pos } = await db(sb).from('reference_positions').select('id, name_he, name_ru').in('id', [...new Set(rows.map(r => r.position_id).filter(Boolean))])
  const posName = new Map(((pos ?? []) as Array<{ id: string; name_he: string | null; name_ru: string | null }>).map(p => [p.id, (p.name_he || p.name_ru || '').trim()]))
  const [ps, deps] = await Promise.all([persons(sb, ids), names(sb, 'departments', rows.map(r => r.department_id))])
  const join = (xs: Array<string | null | undefined>) => [...new Set(xs.filter((x): x is string => !!x))].join(', ') || null
  return ids.filter(id => !readOnly.has(id)).flatMap(id => {
    const p = ps.get(id)
    if (!p) return []
    const mine = rows.filter(r => r.person_id === id)
    return [{
      ...fromPerson(p),
      department: join(mine.map(r => (r.department_id ? deps.get(r.department_id) : null))),
      position: join(mine.map(r => (r.position_id ? posName.get(r.position_id) : null))),
    }]
  })
}

async function alumni(sb: SB): Promise<ContactOut[]> {
  const { data, error } = await db(sb).from('alumni_profiles').select('person_id, graduation_year, institution, direction')
  if (error) throw error
  const rows = (data ?? []) as Array<{ person_id: string; graduation_year: number | null; institution: string | null; direction: string | null }>
  const ps = await persons(sb, rows.map(r => r.person_id))
  return rows.flatMap(r => {
    const p = ps.get(r.person_id)
    if (!p) return []
    return [{
      ...fromPerson(p),
      department: r.institution || null,
      year: r.graduation_year != null ? String(r.graduation_year) : null,
      track: r.direction || null,
    }]
  })
}

async function donors(sb: SB): Promise<ContactOut[]> {
  const { data, error } = await db(sb).from('sponsors').select('id, name, email, phone, address, sponsor_type').eq('is_active', true)
  if (error) throw error
  return ((data ?? []) as Array<{ id: string; name: string; email: string | null; phone: string | null; address: string | null; sponsor_type: string | null }>)
    .map(s => ({ ...base('sponsor', s.id, s.name), phone: s.phone || null, email: s.email || null, city: s.address || null, category: s.sponsor_type }))
}

export interface PrivateRow {
  id: string; owner_id: string; full_name: string; phone: string | null; email: string | null; city: string | null
  organization: string | null; role_title: string | null; category: string | null; notes: string | null
}
export const PRIVATE_COLS = 'id, owner_id, full_name, phone, email, city, organization, role_title, category, notes'

async function privateContacts(sb: SB, personId: string): Promise<ContactOut[]> {
  const { data: own, error } = await db(sb).from('private_contacts').select(PRIVATE_COLS).eq('owner_id', personId)
  if (error) throw error
  const { data: sh } = await db(sb).from('private_contact_shares').select('contact_id').eq('person_id', personId)
  const sharedIds = ((sh ?? []) as Array<{ contact_id: string }>).map(r => r.contact_id)
  let shared: PrivateRow[] = []
  if (sharedIds.length > 0) {
    const { data } = await db(sb).from('private_contacts').select(PRIVATE_COLS).in('id', sharedIds)
    shared = (data ?? []) as PrivateRow[]
  }
  const ownRows = (own ?? []) as PrivateRow[]
  const { data: outShares } = ownRows.length > 0
    ? await db(sb).from('private_contact_shares').select('contact_id').in('contact_id', ownRows.map(r => r.id))
    : { data: [] }
  const sharedOut = new Set(((outShares ?? []) as Array<{ contact_id: string }>).map(r => r.contact_id))
  const owners = await persons(sb, shared.map(r => r.owner_id))
  const toOut = (r: PrivateRow): ContactOut => ({
    ...base('private', r.id, r.full_name), phone: r.phone, email: r.email, city: r.city,
    department: r.organization, position: r.role_title, category: r.category,
  })
  return [
    ...ownRows.map(r => ({ ...toOut(r), shared: sharedOut.has(r.id) })),
    ...shared.filter(r => r.owner_id !== personId).map(r => {
      const o = owners.get(r.owner_id)
      return { ...toOut(r), owner_name: o ? personName(o) : null }
    }),
  ]
}

export async function listGroup(sb: SB, session: SessionPayload, group: ContactGroup): Promise<ContactOut[]> {
  const list = group === 'students' ? await students(sb)
    : group === 'staff' ? await staff(sb)
      : group === 'alumni' ? await alumni(sb)
        : group === 'donors' ? await donors(sb)
          : await privateContacts(sb, session.person_id)
  await attachPhotos(sb, list, group === 'students' || group === 'alumni')
  return list.sort((a, b) => a.name.localeCompare(b.name, 'he'))
}

// ── Фото ────────────────────────────────────────────────────────────────────

export const CONTACT_PHOTO_TTL = 3600

/**
 * Фото для списка: своё фото из ספר אנשי קשר; для студентов и выпускников,
 * у кого его нет, — «תמונת פרופיל» из их документов.
 */
export async function attachPhotos(sb: SB, list: ContactOut[], withStudentDocs: boolean): Promise<void> {
  if (list.length === 0) return
  const paths = new Map<string, string>()
  for (const kind of ['person', 'sponsor', 'private'] as const) {
    const ids = list.filter(c => c.kind === kind).map(c => c.id)
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error } = await db(sb).from('address_book_photos').select('ref_id, storage_path').eq('kind', kind).in('ref_id', ids.slice(i, i + 300))
      if (error) {
        if (isMissingTable(error)) return
        throw error
      }
      for (const r of (data ?? []) as Array<{ ref_id: string; storage_path: string }>) paths.set(`${kind}:${r.ref_id}`, r.storage_path)
    }
  }
  if (paths.size > 0) {
    const { data: signed, error } = await sb.storage.from(DOCUMENTS_BUCKET).createSignedUrls([...paths.values()], CONTACT_PHOTO_TTL)
    if (error) throw error
    const byPath = new Map((signed ?? []).map(s => [s.path, s.signedUrl ?? null]))
    for (const c of list) {
      const p = paths.get(`${c.kind}:${c.id}`)
      if (p) c.photo_url = byPath.get(p) ?? null
    }
  }
  if (withStudentDocs) {
    const missing = list.filter(c => c.kind === 'person' && !c.photo_url).map(c => c.id)
    for (let i = 0; i < missing.length; i += 200) {
      const urls = await loadProfilePhotoUrls(missing.slice(i, i + 200))
      for (const c of list) if (!c.photo_url && urls[c.id]) c.photo_url = urls[c.id]
    }
  }
}

/** Есть ли такой человек в одной из групп (чтобы не править произвольных людей). */
export async function personInAddressBook(sb: SB, personId: string): Promise<boolean> {
  const [{ data: j }, { data: s }, { data: a }] = await Promise.all([
    db(sb).from('education_journeys').select('id').eq('person_id', personId).eq('education_status', 'student').eq('is_deleted', false).limit(1),
    db(sb).from('staff_positions').select('person_id').eq('person_id', personId).limit(1),
    db(sb).from('alumni_profiles').select('person_id').eq('person_id', personId).limit(1),
  ])
  return [j, s, a].some(x => Array.isArray(x) && x.length > 0)
}

// ── Карточка контакта ───────────────────────────────────────────────────────

/** Человек из системы с учебными/рабочими данными (для карточки). */
export async function personContact(sb: SB, personId: string): Promise<ContactOut | null> {
  const ps = await persons(sb, [personId])
  const p = ps.get(personId)
  if (!p) return null
  const out = fromPerson(p)
  const { data: j } = await db(sb).from('education_journeys')
    .select('primary_department_id, main_group_id, specialty_id, year_level, opened_at')
    .eq('person_id', personId).eq('education_status', 'student').eq('is_deleted', false)
    .order('opened_at', { ascending: false }).limit(1)
  const jr = ((j ?? []) as Array<{ primary_department_id: string | null; main_group_id: string | null; specialty_id: string | null; year_level: number | null }>)[0]
  if (jr) {
    const [deps, groups, specs] = await Promise.all([
      names(sb, 'departments', [jr.primary_department_id]), names(sb, 'study_groups', [jr.main_group_id]), names(sb, 'specialties', [jr.specialty_id]),
    ])
    out.department = jr.primary_department_id ? deps.get(jr.primary_department_id) ?? null : null
    out.group_name = jr.main_group_id ? groups.get(jr.main_group_id) ?? null : null
    out.track = jr.specialty_id ? specs.get(jr.specialty_id) ?? null : null
    out.year = jr.year_level != null ? String(jr.year_level) : null
  } else {
    const { data: a } = await db(sb).from('alumni_profiles').select('graduation_year, institution, direction').eq('person_id', personId).limit(1)
    const al = ((a ?? []) as Array<{ graduation_year: number | null; institution: string | null; direction: string | null }>)[0]
    if (al) {
      out.department = al.institution || null
      out.year = al.graduation_year != null ? String(al.graduation_year) : null
      out.track = al.direction || null
    }
  }
  const today = todayISO()
  const { data: sp } = await db(sb).from('staff_positions').select('department_id, position_id, end_date').eq('person_id', personId)
  const active = ((sp ?? []) as Array<{ department_id: string | null; position_id: string | null; end_date: string | null }>)
    .filter(r => r.end_date === null || r.end_date > today)
  if (active.length > 0) {
    const deps = await names(sb, 'departments', active.map(r => r.department_id))
    const { data: pos } = await db(sb).from('reference_positions').select('id, name_he, name_ru').in('id', active.map(r => r.position_id).filter(Boolean))
    const posName = new Map(((pos ?? []) as Array<{ id: string; name_he: string | null; name_ru: string | null }>).map(x => [x.id, (x.name_he || x.name_ru || '').trim()]))
    out.position = [...new Set(active.map(r => (r.position_id ? posName.get(r.position_id) : '')).filter(Boolean))].join(', ') || null
    if (!out.department) out.department = [...new Set(active.map(r => (r.department_id ? deps.get(r.department_id) : '')).filter(Boolean))].join(', ') || null
  }
  return out
}

/** Встречи в календаре владельца, где этот человек — участник или студент встречи. */
export async function meetingsWith(sb: SB, ownerId: string, personId: string): Promise<Array<{ id: string; title: string; starts_at: string; ends_at: string; status: string }>> {
  const [{ data: att }, { data: jr }] = await Promise.all([
    db(sb).from('appointment_attendees').select('appointment_id').eq('person_id', personId),
    db(sb).from('education_journeys').select('id').eq('person_id', personId),
  ])
  const apptIds = ((att ?? []) as Array<{ appointment_id: string }>).map(r => r.appointment_id)
  const journeyIds = ((jr ?? []) as Array<{ id: string }>).map(r => r.id)
  const found = new Map<string, { id: string; title: string; starts_at: string; ends_at: string; status: string }>()
  const cols = 'id, title, starts_at, ends_at, status'
  if (apptIds.length > 0) {
    const { data, error } = await db(sb).from('appointments').select(cols).eq('provider_id', ownerId).in('id', apptIds.slice(0, 500))
    if (error) throw error
    for (const r of (data ?? []) as Array<{ id: string; title: string; starts_at: string; ends_at: string; status: string }>) found.set(r.id, r)
  }
  if (journeyIds.length > 0) {
    const { data, error } = await db(sb).from('appointments').select(cols).eq('provider_id', ownerId).in('journey_id', journeyIds)
    if (error) throw error
    for (const r of (data ?? []) as Array<{ id: string; title: string; starts_at: string; ends_at: string; status: string }>) found.set(r.id, r)
  }
  return [...found.values()].sort((a, b) => b.starts_at.localeCompare(a.starts_at)).slice(0, 100)
}

export type ContactAccess =
  | { kind: 'person'; level: AddressBookRole }
  | { kind: 'sponsor'; level: AddressBookRole; row: { id: string; name: string; email: string | null; phone: string | null; address: string | null; sponsor_type: string | null; notes: string | null; person_id: string | null } }
  | { kind: 'private'; level: 'owner' | 'shared'; row: PrivateRow; sharedWith: string[] }

/** Кто и как может открыть контакт; null — нет такого или нельзя (не различаем). */
export async function contactAccess(sb: SB, session: SessionPayload, acc: AddressBookAccess, kind: ContactKind, id: string): Promise<ContactAccess | null> {
  if (kind === 'private') {
    const { data, error } = await db(sb).from('private_contacts').select(PRIVATE_COLS).eq('id', id).maybeSingle()
    if (error) throw error
    if (!data) return null
    const row = data as PrivateRow
    const { data: sh } = await db(sb).from('private_contact_shares').select('person_id').eq('contact_id', id)
    const sharedWith = ((sh ?? []) as Array<{ person_id: string }>).map(r => r.person_id)
    if (row.owner_id === session.person_id) return { kind, level: 'owner', row, sharedWith }
    return sharedWith.includes(session.person_id) ? { kind, level: 'shared', row, sharedWith } : null
  }
  if (!acc.role) return null
  if (kind === 'sponsor') {
    const { data, error } = await db(sb).from('sponsors').select('id, name, email, phone, address, sponsor_type, notes, person_id').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? { kind, level: acc.role, row: data } : null
  }
  return (await personInAddressBook(sb, id)) ? { kind, level: acc.role } : null
}
