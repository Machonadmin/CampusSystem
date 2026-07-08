import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireSponsorsPrivilege } from '@/lib/sponsors/permissions'
import { mapDbError } from '@/lib/sponsors/http'
import { isIsoDate, isDonationStatus, isValidAmount } from '@/lib/sponsors/validation'
import { donationStats, campaignTotals } from '@/lib/sponsors/donations'
import type { DonationRow, DonationInsert } from '@/types/database'

/**
 * GET  /api/sponsors/[id]/donations — пожертвования донора (view). Проверяет
 *   существование донора (404). Ответ: { donations, stats, campaigns }, где
 *   stats — donationStats (received/pledged/cancelled), campaigns —
 *   campaignTotals по received. amount приводится к числу.
 * POST /api/sponsors/[id]/donations — записать пожертвование (manage): amount
 *   (>=0, обяз.), donation_date (YYYY-MM-DD, обяз.), purpose, campaign, method,
 *   status (pledged|received|cancelled, по умолч. pledged). created_by из сессии.
 */

const DONATION_COLS =
  'id, sponsor_id, amount, donation_date, purpose, campaign, method, status, notes, created_by, created_at, updated_at'

const PAGE = 1000

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSponsorsPrivilege('view')

    const sb = createServerClient()

    const { data: sponsor, error: sErr } = await sb
      .from('sponsors')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (sErr) throw sErr
    if (!sponsor) return NextResponse.json({ error: 'Донор не найден' }, { status: 404 })

    // Читаем ВСЕ пожертвования донора ПОСТРАНИЧНО (устойчиво к db-max-rows
    // PostgREST): список, stats и campaigns считаются по полному набору, а не по
    // молча обрезанной первой странице. Порядок donation_date/created_at/id даёт
    // и нужную сортировку (свежие сверху), и стабильную тотальную для OFFSET.
    const rows: DonationRow[] = []
    let offset = 0
    for (;;) {
      const { data, error } = await sb
        .from('donations')
        .select(DONATION_COLS)
        .eq('sponsor_id', params.id)
        .order('donation_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const batch = (data ?? []) as unknown as DonationRow[]
      rows.push(...batch)
      if (batch.length < PAGE) break
      offset += PAGE
    }

    // amount может прийти строкой от PostgREST — нормализуем к числу для клиента.
    const donations = rows.map(d => ({ ...d, amount: Number(d.amount) }))

    return NextResponse.json({
      donations,
      stats: donationStats(rows),
      campaigns: campaignTotals(rows),
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSponsorsPrivilege('manage')

    const body = await request.json() as {
      amount?: unknown
      donation_date?: string
      purpose?: string | null
      campaign?: string | null
      method?: string | null
      status?: string
      notes?: string | null
    }

    if (!isValidAmount(body.amount)) {
      return NextResponse.json({ error: 'amount должен быть числом ≥ 0' }, { status: 400 })
    }
    const amount = Number(body.amount)

    const donationDate = body.donation_date?.trim()
    if (!donationDate) {
      return NextResponse.json({ error: 'donation_date обязателен' }, { status: 400 })
    }
    if (!isIsoDate(donationDate)) {
      return NextResponse.json({ error: 'donation_date должен быть датой в формате YYYY-MM-DD' }, { status: 400 })
    }

    // status: не задан → 'pledged'; задан → должен быть допустимым.
    let status: DonationInsert['status'] = 'pledged'
    if (body.status !== undefined && body.status !== null && body.status !== '') {
      if (!isDonationStatus(body.status)) {
        return NextResponse.json({ error: 'Неверный статус пожертвования' }, { status: 400 })
      }
      status = body.status
    }

    const sb = createServerClient()

    const { data: sponsor, error: sErr } = await sb
      .from('sponsors')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (sErr) throw sErr
    if (!sponsor) return NextResponse.json({ error: 'Донор не найден' }, { status: 404 })

    const insert: DonationInsert = {
      sponsor_id: params.id,
      amount,
      donation_date: donationDate,
      purpose: body.purpose?.trim() || null,
      campaign: body.campaign?.trim() || null,
      method: body.method?.trim() || null,
      status,
      notes: body.notes?.trim() || null,
      created_by: session.person_id,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('donations')
      .insert(insert as any)
      .select(DONATION_COLS)
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    // amount может прийти строкой от PostgREST — возвращаем числом, как GET.
    const created = data as unknown as DonationRow
    return NextResponse.json({ ...created, amount: Number(created.amount) }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
