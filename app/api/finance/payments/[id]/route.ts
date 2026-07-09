import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireFinancePrivilege } from '@/lib/finance/permissions'
import { mapDbError } from '@/lib/finance/http'
import { isIsoDate } from '@/lib/finance/validation'
import type { FinancePaymentUpdate } from '@/types/database'

/**
 * PATCH /api/finance/payments/[id]
 *
 * Редактировать / отменить платёж. Право: finance.create_invoice.
 *
 * Разрешено менять: amount (>0), paid_at, method, reference, status.
 * status может быть только 'pending' или 'cancelled' — ПОДТВЕРЖДЕНИЕ
 * ('approved') выполняется исключительно через .../approve (право
 * approve_payment). Инвариант: сумму в баланс может добавить только
 * approve_payment; create_invoice способен лишь убрать её (cancel).
 * 404 — платёж не найден.
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireFinancePrivilege('create_invoice')

    const body = await request.json() as {
      amount?: number
      paid_at?: string
      method?: string | null
      reference?: string | null
      status?: string
    }

    const update: FinancePaymentUpdate = {}
    if (body.amount !== undefined) {
      const amount = Number(body.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: 'amount должен быть числом > 0' }, { status: 400 })
      }
      update.amount = amount
    }
    if (body.paid_at !== undefined) {
      const paidAt = body.paid_at?.trim()
      if (!paidAt) return NextResponse.json({ error: 'paid_at не может быть пустым' }, { status: 400 })
      if (!isIsoDate(paidAt)) {
        return NextResponse.json({ error: 'paid_at должен быть датой в формате YYYY-MM-DD' }, { status: 400 })
      }
      update.paid_at = paidAt
    }
    if (body.method !== undefined) update.method = body.method?.trim() || null
    if (body.reference !== undefined) update.reference = body.reference?.trim() || null
    if (body.status !== undefined) {
      if (body.status !== 'pending' && body.status !== 'cancelled') {
        return NextResponse.json(
          { error: "status может быть только 'pending' или 'cancelled' (подтверждение — через /approve)" },
          { status: 400 }
        )
      }
      update.status = body.status
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('finance_payments')
      .select('id, status')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return NextResponse.json({ error: 'Платёж не найден' }, { status: 404 })

    // Инвариант: сумму в баланс может добавить только approve_payment. Поэтому
    // ПОДТВЕРЖДЁННЫЙ платёж этим маршрутом (create_invoice) можно ТОЛЬКО
    // отменить (status='cancelled') — правка amount/paid_at/method/reference или
    // возврат в 'pending' изменили бы Σ(approved) в обход подтверждения. 409.
    if (existing.status === 'approved') {
      const onlyCancelling =
        update.status === 'cancelled' &&
        update.amount === undefined &&
        update.paid_at === undefined &&
        update.method === undefined &&
        update.reference === undefined
      if (!onlyCancelling) {
        return NextResponse.json(
          { error: "Подтверждённый платёж можно только отменить (status='cancelled'); правка суммы/полей — операция approve_payment" },
          { status: 409 }
        )
      }
    }

    // Условная запись (атомарно, без TOCTOU): применяем правку ТОЛЬКО если статус
    // не изменился с момента чтения existing. Иначе (напр. параллельный approve)
    // проверка инварианта выше уже неактуальна — 0 строк → 409.
    const { data, error } = await sb
      .from('finance_payments')
      .update(update)
      .eq('id', params.id)
      .eq('status', existing.status)
      .select('*')
      .maybeSingle()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Статус платежа изменился (параллельное изменение), повторите' },
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
