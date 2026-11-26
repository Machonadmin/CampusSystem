import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireModuleUser } from '@/lib/modules/personal-access'
import { errorResponse } from '@/lib/api/handler'
import { db, personNames } from '@/lib/meetings/access'
import { isUuid } from '@/lib/meetings/rules'
import {
  isContactKind, sensitiveAccess, cleanTechPatch, cleanPrivatePatch, replaceFirstPhone, type ContactKind,
} from '@/lib/meetings/contacts'
import {
  addressBookAccess, contactAccess, personContact, meetingsWith, attachPhotos, cityOf, type ContactOut,
} from '@/lib/meetings/contacts-server'
import { DOCUMENTS_BUCKET } from '@/lib/documents/storage'

/**
 * Карточка контакта ספר אנשי הקשר. kind: person | sponsor | private.
 *
 * GET    → { contact, can_edit, is_owner, sensitive? }
 *          מזכירת המנהל получает только технические данные. המנהל — ещё
 *          встречи с человеком в своём календаре; superadmin — заметки,
 *          семейные данные, пожертвования. Личный контакт: владелец видит всё,
 *          тот, с кем поделились, — без заметок.
 * PATCH  — технические поля (имя, телефон, email, город); у личного контакта
 *          владелец правит всё и список «с кем поделиться» (shared_with).
 * DELETE — только личный контакт, только владелец.
 */

type Params = { params: Promise<{ kind: string; id: string }> }

async function open(props: Params) {
  const { kind, id } = await props.params
  if (!isContactKind(kind) || !isUuid(id)) return { err: apiError('record_not_found', 404) }
  const session = await requireModuleUser('meetings')
  const sb = createServerClient()
  const acc = await addressBookAccess(sb, session)
  const access = await contactAccess(sb, session, acc, kind as ContactKind, id)
  if (!access) return { err: apiError('record_not_found', 404) }
  return { session, sb, acc, access, id }
}

export async function GET(_req: NextRequest, props: Params) {
  try {
    const g = await open(props)
    if ('err' in g) return g.err
    const { sb, session, acc, access, id } = g
    const sens = sensitiveAccess(acc.role, acc.isSuperadmin)
    let contact: ContactOut | null = null
    const extra: Record<string, unknown> = {}

    if (access.kind === 'person') {
      contact = await personContact(sb, id)
      if (!contact) return apiError('record_not_found', 404)
      if (sens.meetings) extra.meetings = await meetingsWith(sb, session.person_id, id)
      if (sens.notes) {
        const { data } = await db(sb).from('persons').select('notes, marital_status, birth_date').eq('id', id).maybeSingle()
        const p = (data ?? {}) as { notes?: string | null; marital_status?: string | null; birth_date?: string | null }
        extra.notes = p.notes ?? null
        extra.family = { marital_status: p.marital_status ?? null, birth_date: p.birth_date ?? null }
      }
    } else if (access.kind === 'sponsor') {
      const s = access.row
      contact = {
        kind: 'sponsor', id: s.id, name: s.name, phone: s.phone, email: s.email, city: s.address,
        department: null, group_name: null, year: null, track: null, position: null, category: s.sponsor_type, photo_url: null,
      }
      if (sens.meetings && s.person_id) extra.meetings = await meetingsWith(sb, session.person_id, s.person_id)
      if (sens.notes) {
        extra.notes = s.notes
        const { data } = await db(sb).from('donations').select('id, amount, donation_date, purpose, status').eq('sponsor_id', s.id).order('donation_date', { ascending: false }).limit(50)
        const items = (data ?? []) as Array<{ id: string; amount: number | string; donation_date: string; purpose: string | null; status: string }>
        extra.donations = {
          items,
          total_received: items.filter(d => d.status === 'received').reduce((sum, d) => sum + Number(d.amount || 0), 0),
        }
      }
    } else {
      const r = access.row
      contact = {
        kind: 'private', id: r.id, name: r.full_name, phone: r.phone, email: r.email, city: r.city,
        department: r.organization, group_name: null, year: null, track: null, position: r.role_title, category: r.category, photo_url: null,
      }
      if (access.level === 'owner') {
        extra.notes = r.notes
        const names = await personNames(sb, access.sharedWith)
        extra.shared_with = access.sharedWith.map(pid => ({ id: pid, name: names.get(pid) ?? '' }))
      } else {
        const names = await personNames(sb, [r.owner_id])
        contact.owner_name = names.get(r.owner_id) ?? null
      }
    }

    await attachPhotos(sb, [contact], access.kind === 'person')
    const canEdit = access.kind === 'private' ? access.level === 'owner' : true
    return NextResponse.json({
      contact,
      can_edit: canEdit,
      is_owner: access.kind === 'private' && access.level === 'owner',
      ...extra,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function PATCH(request: NextRequest, props: Params) {
  try {
    const g = await open(props)
    if ('err' in g) return g.err
    const { sb, session, access, id } = g
    const body = await request.json().catch(() => ({})) as Record<string, unknown>

    if (access.kind === 'private') {
      if (access.level !== 'owner') return apiError('forbidden', 403)
      const c = cleanPrivatePatch(body)
      if (!c.ok) return apiError('meetings_invalid_input', 400)
      if (Object.keys(c.patch).length > 0) {
        const { error } = await db(sb).from('private_contacts').update(c.patch).eq('id', id)
        if (error) throw error
      }
      if ('shared_with' in body) {
        if (!Array.isArray(body.shared_with)) return apiError('meetings_invalid_input', 400)
        const want = [...new Set(body.shared_with.filter(isUuid))].filter(pid => pid !== session.person_id).slice(0, 50)
        const { error: dErr } = await db(sb).from('private_contact_shares').delete().eq('contact_id', id)
        if (dErr) throw dErr
        if (want.length > 0) {
          const { error: iErr } = await db(sb).from('private_contact_shares').insert(want.map(pid => ({ contact_id: id, person_id: pid })))
          if (iErr) throw iErr
        }
      }
      return NextResponse.json({ ok: true })
    }

    const c = cleanTechPatch(body)
    if (!c.ok) return apiError('meetings_invalid_input', 400)
    const p = c.patch
    if (Object.keys(p).length === 0) return NextResponse.json({ ok: true })

    if (access.kind === 'sponsor') {
      const upd: Record<string, unknown> = {}
      if (p.name !== undefined) upd.name = p.name
      if (p.phone !== undefined) upd.phone = p.phone
      if (p.email !== undefined) upd.email = p.email
      if (p.city !== undefined) upd.address = p.city
      const { error } = await db(sb).from('sponsors').update(upd).eq('id', id)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    const { data: cur, error: cErr } = await db(sb).from('persons').select('phones, address').eq('id', id).maybeSingle()
    if (cErr) throw cErr
    if (!cur) return apiError('record_not_found', 404)
    const upd: Record<string, unknown> = {}
    // Имя в ספר אנשי קשר — отображаемое имя (на иврите), как везде в системе.
    if (p.name !== undefined) upd.hebrew_name = p.name
    if (p.email !== undefined) upd.email = p.email
    if (p.phone !== undefined) upd.phones = replaceFirstPhone((cur as { phones: unknown }).phones, p.phone)
    if (p.city !== undefined) {
      const addr = (cur as { address: unknown }).address
      const base = addr && typeof addr === 'object' && !Array.isArray(addr) ? addr as Record<string, unknown> : {}
      if (p.city !== cityOf(addr)) upd.address = { ...base, city: p.city }
    }
    if (Object.keys(upd).length > 0) {
      const { error } = await db(sb).from('persons').update(upd).eq('id', id)
      if (error) throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function DELETE(_req: NextRequest, props: Params) {
  try {
    const g = await open(props)
    if ('err' in g) return g.err
    const { sb, access, id } = g
    if (access.kind !== 'private' || access.level !== 'owner') return apiError('forbidden', 403)
    const { data: ph } = await db(sb).from('address_book_photos').select('storage_path').eq('kind', 'private').eq('ref_id', id).maybeSingle()
    const { error } = await db(sb).from('private_contacts').delete().eq('id', id)
    if (error) throw error
    if (ph) {
      const { error: pErr } = await db(sb).from('address_book_photos').delete().eq('kind', 'private').eq('ref_id', id)
      if (pErr) console.error('[contacts] photo row:', pErr)
      const { error: sErr } = await sb.storage.from(DOCUMENTS_BUCKET).remove([(ph as { storage_path: string }).storage_path])
      if (sErr) console.error('[contacts] storage remove:', sErr)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
