import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireFinancePrivilege } from '@/lib/finance/permissions'
import { mapDbError } from '@/lib/finance/http'
import { isIsoDate } from '@/lib/finance/validation'
import type { FinanceChargeUpdate } from '@/types/database'

/**
 * PATCH  /api/finance/charges/[id]  — редактировать начисление, в т.ч. отменить
 *                                     его (status='cancelled', выводит из баланса).
 * DELETE /api/finance/charges/[id]  — жёсткое удаление начисления.
 *
 * Право (оба): finance.create_invoice.
 * 404 — если начисление не найдено.
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireFinancePrivilege('create_invoice')

    const body = await request.json() as {
      amount?: number
      description?: string
      period_label?: string | null
      due_date?: string | null
      status?: string
    }

    const update: FinanceChargeUpdate = {}
    if (body.amount !== undefined) {
      const amount = Number(body.amount)
      if (!Number.isFinite(amount) || amount < 0) {
        return apiError('amount_number_gte_0', 400)
      }
      update.amount = amount
    }
    if (body.description !== undefined) {
      const d = body.description?.trim()
      if (!d) return apiError('description_field_not_empty', 400)
      update.description = d
    }
    if (body.period_label !== undefined) update.period_label = body.period_label?.trim() || null
    if (body.due_date !== undefined) {
      const dueDate = body.due_date?.trim() || null
      if (dueDate && !isIsoDate(dueDate)) {
        return apiError('due_date_must_be_date', 400)
      }
      update.due_date = dueDate
    }
    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'cancelled') {
        return apiError('status_active_or_cancelled', 400)
      }
      update.status = body.status
    }

    if (Object.keys(update).length === 0) {
      return apiError('no_changes', 400)
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('finance_charges')
      .select('id, status')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return apiError('charge_not_found', 404)

    // Условная запись при смене статуса (атомарно, без TOCTOU): применяем ТОЛЬКО
    // если статус не изменился с момента чтения. Иначе 0 строк → 409.
    let writeQuery = sb
      .from('finance_charges')
      .update(update)
      .eq('id', params.id)
    if (update.status !== undefined) {
      writeQuery = writeQuery.eq('status', existing.status)
    }
    const { data, error } = await writeQuery
      .select('*')
      .maybeSingle()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    if (!data) {
      return apiError('charge_status_changed_retry', 409)
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireFinancePrivilege('create_invoice')

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('finance_charges')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return apiError('charge_not_found', 404)

    const { error } = await sb.from('finance_charges').delete().eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
