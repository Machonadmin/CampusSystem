import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireSponsorsPrivilege } from '@/lib/sponsors/permissions'
import { mapDbError } from '@/lib/sponsors/http'
import { isIsoDate, isDonationStatus, isValidAmount } from '@/lib/sponsors/validation'
import type { DonationUpdate, DonationRow } from '@/types/database'

/**
 * PATCH /api/sponsors/donations/[id] — правка пожертвования / смена статуса
 *   (manage): amount (>=0), donation_date (YYYY-MM-DD), purpose, campaign,
 *   method, status (pledged|received|cancelled), notes. sponsor_id менять нельзя
 *   (DonationUpdate его исключает). 404 — если пожертвование не найдено.
 *
 * NB: статический сегмент `donations` имеет приоритет над динамическим
 * `[id]` — /api/sponsors/donations/{uuid} попадает СЮДА, а /api/sponsors/{uuid}
 * — в app/api/sponsors/[id] (sponsor_id всегда uuid, не «donations»).
 */

const DONATION_COLS =
  'id, sponsor_id, amount, donation_date, purpose, campaign, method, status, notes, created_by, created_at, updated_at'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSponsorsPrivilege('manage')

    const body = await request.json() as {
      amount?: unknown
      donation_date?: string
      purpose?: string | null
      campaign?: string | null
      method?: string | null
      status?: string
      notes?: string | null
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('donations')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return apiError('donation_not_found', 404)

    const update: DonationUpdate = {}

    if (body.amount !== undefined) {
      if (!isValidAmount(body.amount)) {
        return apiError('amount_number_gte_0', 400)
      }
      update.amount = Number(body.amount)
    }

    if (body.donation_date !== undefined) {
      const donationDate = body.donation_date?.trim()
      if (!donationDate || !isIsoDate(donationDate)) {
        return apiError('donation_date_must_be_date', 400)
      }
      update.donation_date = donationDate
    }

    if (body.status !== undefined) {
      if (!isDonationStatus(body.status)) {
        return apiError('invalid_donation_status', 400)
      }
      update.status = body.status
    }

    if (body.purpose !== undefined) update.purpose = body.purpose?.trim() || null
    if (body.campaign !== undefined) update.campaign = body.campaign?.trim() || null
    if (body.method !== undefined) update.method = body.method?.trim() || null
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null

    if (Object.keys(update).length === 0) {
      return apiError('no_changes', 400)
    }

    const { data, error } = await sb
      .from('donations')
      .update(update)
      .eq('id', params.id)
      .select(DONATION_COLS)
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    // amount может прийти строкой от PostgREST — возвращаем числом, как GET.
    const updated = data as unknown as DonationRow
    return NextResponse.json({ ...updated, amount: Number(updated.amount) })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
