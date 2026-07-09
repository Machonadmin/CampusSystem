import { NextRequest, NextResponse } from 'next/server'
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
        return NextResponse.json({ error: 'amount должен быть числом ≥ 0' }, { status: 400 })
      }
      update.amount = amount
    }
    if (body.description !== undefined) {
      const d = body.description?.trim()
      if (!d) return NextResponse.json({ error: 'description не может быть пустым' }, { status: 400 })
      update.description = d
    }
    if (body.period_label !== undefined) update.period_label = body.period_label?.trim() || null
    if (body.due_date !== undefined) {
      const dueDate = body.due_date?.trim() || null
      if (dueDate && !isIsoDate(dueDate)) {
        return NextResponse.json({ error: 'due_date должен быть датой в формате YYYY-MM-DD' }, { status: 400 })
      }
      update.due_date = dueDate
    }
    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'cancelled') {
        return NextResponse.json({ error: "status должен быть 'active' или 'cancelled'" }, { status: 400 })
      }
      update.status = body.status
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('finance_charges')
      .select('id, status')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return NextResponse.json({ error: 'Начисление не найдено' }, { status: 404 })

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
      return NextResponse.json(
        { error: 'Статус начисления изменился (параллельное изменение), повторите' },
        { status: 409 }
      )
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
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
    if (!existing) return NextResponse.json({ error: 'Начисление не найдено' }, { status: 404 })

    const { error } = await sb.from('finance_charges').delete().eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
