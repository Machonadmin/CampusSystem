import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireSponsorsPrivilege } from '@/lib/sponsors/permissions'
import { mapDbError } from '@/lib/sponsors/http'
import { isSponsorType } from '@/lib/sponsors/validation'
import { matchesSponsorSearch } from '@/lib/sponsors/donations'
import { loadDonationAggregates, receivedForSponsor } from '@/lib/sponsors/donations-server'
import type { SponsorRow, SponsorInsert } from '@/types/database'

/**
 * GET  /api/sponsors — справочник доноров (view). Фильтры ?search (app-side,
 *   matchesSponsorSearch) ?type ?active. Читает ВЕСЬ справочник ПОСТРАНИЧНО
 *   (устойчиво к db-max-rows). К каждому донору добавляется total_received —
 *   Σ его пожертвований 'received' (в копейках, без N+1, см. donations-server).
 *   Ответ: { sponsors, stats } — stats (received/pledged/cancelled) считается по
 *   ВСЕМ пожертвованиям, список — по фильтрам.
 * POST /api/sponsors — создать донора (manage): name (обяз.), sponsor_type,
 *   email, phone, address, contact_person, notes, is_active. created_by из сессии.
 */

const SPONSOR_COLS =
  'id, name, sponsor_type, email, phone, address, contact_person, notes, is_active, created_by, created_at, updated_at'

const PAGE = 1000

export async function GET(request: NextRequest) {
  try {
    await requireSponsorsPrivilege('view')

    const params = request.nextUrl.searchParams
    const type = params.get('type')
    if (type !== null && !isSponsorType(type)) {
      return apiError('invalid_donor_type', 400)
    }
    const activeParam = params.get('active')
    if (activeParam !== null && activeParam !== 'true' && activeParam !== 'false') {
      return apiError('active_boolean', 400)
    }

    const sb = createServerClient()

    // Весь справочник доноров постранично.
    const all: SponsorRow[] = []
    let offset = 0
    for (;;) {
      const { data, error } = await sb
        .from('sponsors')
        .select(SPONSOR_COLS)
        .order('name', { ascending: true })
        .order('id', { ascending: true })   // тотальная сортировка — стабильный OFFSET
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const batch = (data ?? []) as unknown as SponsorRow[]
      all.push(...batch)
      if (batch.length < PAGE) break
      offset += PAGE
    }

    // Суммы пожертвований (received по донору + глобальная сводка) за один
    // постраничный проход — без N+1.
    const aggregates = await loadDonationAggregates(sb)

    let sponsors = all.map(s => ({
      ...s,
      total_received: receivedForSponsor(aggregates, s.id),
    }))

    if (type !== null) sponsors = sponsors.filter(s => s.sponsor_type === type)
    if (activeParam !== null) {
      const wantActive = activeParam === 'true'
      sponsors = sponsors.filter(s => s.is_active === wantActive)
    }
    const search = params.get('search')
    if (search !== null) {
      sponsors = sponsors.filter(s => matchesSponsorSearch(s, search))
    }

    return NextResponse.json({ sponsors, stats: aggregates.stats })
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
    const session = await requireSponsorsPrivilege('manage')

    const body = await request.json() as {
      name?: string
      sponsor_type?: string
      email?: string | null
      phone?: string | null
      address?: string | null
      contact_person?: string | null
      notes?: string | null
      is_active?: unknown
    }

    const name = body.name?.trim()
    if (!name) {
      return apiError('name_field_required', 400)
    }

    // sponsor_type: не задан → 'individual'; задан → должен быть допустимым.
    let sponsorType: SponsorInsert['sponsor_type'] = 'individual'
    if (body.sponsor_type !== undefined && body.sponsor_type !== null && body.sponsor_type !== '') {
      if (!isSponsorType(body.sponsor_type)) {
        return apiError('invalid_donor_type', 400)
      }
      sponsorType = body.sponsor_type
    }

    if (body.is_active !== undefined && typeof body.is_active !== 'boolean') {
      return apiError('is_active_boolean', 400)
    }

    const sb = createServerClient()

    const insert: SponsorInsert = {
      name,
      sponsor_type: sponsorType,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      address: body.address?.trim() || null,
      contact_person: body.contact_person?.trim() || null,
      notes: body.notes?.trim() || null,
      is_active: body.is_active === undefined ? true : body.is_active,
      created_by: session.person_id,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('sponsors')
      .insert(insert as any)
      .select(SPONSOR_COLS)
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
