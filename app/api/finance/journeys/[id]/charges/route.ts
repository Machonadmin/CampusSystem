import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageStudentFinance } from '@/lib/finance/access'
import { mapDbError } from '@/lib/finance/http'
import { isIsoDate } from '@/lib/finance/validation'
import type { FinanceChargeInsert } from '@/types/database'

/**
 * POST /api/finance/journeys/[id]/charges
 *
 * Создать начисление (что студент ДОЛЖЕН) на journey студента.
 * Право: finance.create_invoice.
 *
 * Body: { amount (>=0, обязательно), description (обязательно),
 *         period_label?, due_date? }
 * created_by = текущий пользователь. status по умолчанию 'active'.
 * 404 — если journey не найден.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStudentFinance(session, params.id))) return apiError('forbidden', 403)

    const body = await request.json() as {
      amount?: number
      description?: string
      period_label?: string | null
      due_date?: string | null
    }

    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount < 0) {
      return apiError('amount_number_gte_0', 400)
    }
    const description = body.description?.trim()
    if (!description) {
      return apiError('description_field_required', 400)
    }
    const dueDate = body.due_date?.trim() || null
    if (dueDate && !isIsoDate(dueDate)) {
      return apiError('due_date_must_be_date', 400)
    }

    const sb = createServerClient()

    const { data: journey, error: jErr } = await sb
      .from('education_journeys')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (jErr) throw jErr
    if (!journey) return apiError('student_not_found', 404)

    const insert: FinanceChargeInsert = {
      journey_id: params.id,
      amount,
      description,
      period_label: body.period_label?.trim() || null,
      due_date: dueDate,
      created_by: session.person_id,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('finance_charges')
      .insert(insert as any)
      .select('*')
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
