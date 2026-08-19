import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireContactsPrivilege } from '@/lib/contacts/permissions'
import { mapDbError } from '@/lib/contacts/http'
import { isContactType, isContactCategory } from '@/lib/contacts/validation'
import { isValidEmail, matchesSearch, contactStats } from '@/lib/contacts/directory'
import type { ContactRow, ContactInsert } from '@/types/database'

/**
 * GET  /api/contacts — справочник контактов (view). Фильтры ?search (app-side,
 *   matchesSearch) ?category ?type ?active. Читает ПОСТРАНИЧНО (устойчиво к
 *   db-max-rows). Ответ: { contacts, stats } — stats считается по ВСЕМУ
 *   справочнику (contactStats), список — по фильтрам.
 * POST /api/contacts — создать контакт (manage): name (обяз.), contact_type,
 *   category, email (isValidEmail если задан), phone, address, website,
 *   contact_person, notes, is_active. Аудит created_by из сессии.
 */

const CONTACT_COLS =
  'id, name, contact_type, category, email, phone, address, website, contact_person, notes, is_active, created_by, created_at, updated_at'

const PAGE = 1000

export async function GET(request: NextRequest) {
  try {
    await requireContactsPrivilege('view')

    const params = request.nextUrl.searchParams
    const category = params.get('category')
    if (category !== null && !isContactCategory(category)) {
      return apiError('invalid_category', 400)
    }
    const type = params.get('type')
    if (type !== null && !isContactType(type)) {
      return apiError('invalid_contact_type', 400)
    }
    const activeParam = params.get('active')
    if (activeParam !== null && activeParam !== 'true' && activeParam !== 'false') {
      return apiError('active_boolean', 400)
    }

    const sb = createServerClient()

    // Весь справочник постранично: stats считается по всем контактам,
    // фильтры применяются app-side поверх той же выборки.
    const all: ContactRow[] = []
    let offset = 0
    for (;;) {
      const { data, error } = await sb
        .from('contacts')
        .select(CONTACT_COLS)
        .order('name', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const batch = (data ?? []) as unknown as ContactRow[]
      all.push(...batch)
      if (batch.length < PAGE) break
      offset += PAGE
    }

    const stats = contactStats(all)

    let contacts = all
    if (category !== null) contacts = contacts.filter(c => c.category === category)
    if (type !== null) contacts = contacts.filter(c => c.contact_type === type)
    if (activeParam !== null) {
      const wantActive = activeParam === 'true'
      contacts = contacts.filter(c => c.is_active === wantActive)
    }
    const search = params.get('search')
    if (search !== null) {
      contacts = contacts.filter(c => matchesSearch(c, search))
    }

    return NextResponse.json({ contacts, stats })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireContactsPrivilege('manage')

    const body = await request.json() as {
      name?: string
      contact_type?: string
      category?: string
      email?: string | null
      phone?: string | null
      address?: string | null
      website?: string | null
      contact_person?: string | null
      notes?: string | null
      is_active?: unknown
    }

    const name = body.name?.trim()
    if (!name) {
      return apiError('name_field_required', 400)
    }

    // contact_type: не задан → 'organization'; задан → должен быть допустимым.
    let contactType: ContactInsert['contact_type'] = 'organization'
    if (body.contact_type !== undefined && body.contact_type !== null && body.contact_type !== '') {
      if (!isContactType(body.contact_type)) {
        return apiError('invalid_contact_type', 400)
      }
      contactType = body.contact_type
    }

    // category: не задана → 'other'; задана → должна быть допустимой.
    let category: ContactInsert['category'] = 'other'
    if (body.category !== undefined && body.category !== null && body.category !== '') {
      if (!isContactCategory(body.category)) {
        return apiError('invalid_category', 400)
      }
      category = body.category
    }

    // email: если задан непустой — валидируем (400 на кривом вводе).
    let email: string | null = null
    if (body.email !== undefined && body.email !== null && body.email !== '') {
      email = body.email.trim()
      if (!isValidEmail(email)) {
        return apiError('invalid_email', 400)
      }
    }

    if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
      return apiError('is_active_boolean', 400)
    }

    const sb = createServerClient()

    const insert: ContactInsert = {
      name,
      contact_type: contactType,
      category,
      email,
      phone: body.phone?.trim() || null,
      address: body.address?.trim() || null,
      website: body.website?.trim() || null,
      contact_person: body.contact_person?.trim() || null,
      notes: body.notes?.trim() || null,
      is_active: body.is_active === undefined ? true : body.is_active,
      created_by: session.person_id,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('contacts')
      .insert(insert as any)
      .select(CONTACT_COLS)
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
