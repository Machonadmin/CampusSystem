import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageStudentFinance } from '@/lib/finance/access'
import { mapDbError } from '@/lib/finance/http'
import { isIsoDate } from '@/lib/finance/validation'
import type { FinanceChargeInsert } from '@/types/database'
import { errorResponse } from '@/lib/api/handler'
import { isMissingRelation } from '@/lib/supabase/errors'
import { tuitionChargeLabel } from '@/lib/education/semester-tuition'

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
 *
 * Счёт за обучение по семестру: Body { class_group_id, due_date? }.
 * Сумму и подпись берём из семестра (class_groups.tuition_amount, задаётся в
 * «Финансы › סמסטרים») — клиентская сумма игнорируется, вручную её не ввести.
 * Счёт category='tuition' с class_group_id, как при авто-начислении. Второй
 * активный счёт за тот же семестр той же студентке — 409. Если студентка уже
 * зачислена в семестр без счёта — привязываем счёт к зачислению, чтобы
 * авто-начисление его не продублировало.
 */

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStudentFinance(session, params.id))) return apiError('forbidden', 403)

    const body = await request.json() as {
      amount?: number
      description?: string
      period_label?: string | null
      due_date?: string | null
      class_group_id?: string | null
    }

    if (body.class_group_id) {
      return createTuitionCharge(params.id, body.class_group_id, body.due_date ?? null, session.person_id)
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
      return errorResponse(m)
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return errorResponse(m)
    }
    return errorResponse(e)
  }
}

type SemesterRow = {
  id: string
  name: string | null
  year_label: string | null
  term_number: number | null
  tuition_amount: number | null
  is_semester: boolean | null
}

async function createTuitionCharge(
  journeyId: string,
  classGroupId: string,
  rawDue: string | null,
  createdBy: string,
): Promise<NextResponse> {
  const dueDate = rawDue?.trim() || null
  if (dueDate && !isIsoDate(dueDate)) return apiError('due_date_must_be_date', 400)

  const sb = createServerClient()

  const { data: journey, error: jErr } = await sb
    .from('education_journeys')
    .select('id')
    .eq('id', journeyId)
    .maybeSingle()
  if (jErr) throw jErr
  if (!journey) return apiError('student_not_found', 404)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: semRaw, error: sErr } = await (sb
    .from('class_groups')
    .select('id, name, year_label, term_number, tuition_amount, is_semester')
    .eq('id', classGroupId)
    .maybeSingle() as any)
  if (sErr) {
    if (isMissingRelation(sErr)) return apiError('semester_not_found', 404)
    throw sErr
  }
  const sem = semRaw as SemesterRow | null
  if (!sem || sem.is_semester !== true) return apiError('semester_not_found', 404)
  const amount = Number(sem.tuition_amount)
  if (sem.tuition_amount == null || !Number.isFinite(amount) || !(amount > 0)) {
    return apiError('semester_tuition_not_set', 400)
  }

  const { data: existing, error: eErr } = await sb
    .from('finance_charges')
    .select('id')
    .eq('journey_id', journeyId)
    .eq('class_group_id', classGroupId)
    .eq('category', 'tuition')
    .eq('status', 'active')
    .limit(1)
  if (eErr) throw eErr
  if ((existing ?? []).length > 0) return apiError('semester_already_charged', 409)

  const label = tuitionChargeLabel(sem)
  const { data, error } = await sb
    .from('finance_charges')
    .insert({
      journey_id: journeyId,
      amount,
      description: label,
      period_label: label,
      due_date: dueDate,
      category: 'tuition',
      class_group_id: classGroupId,
      created_by: createdBy,
    })
    .select('*')
    .single()
  if (error) return errorResponse(mapDbError(error))

  // Уже зачислена в семестр, но счёта ещё нет — привязываем, иначе следующее
  // авто-начисление (смена суммы семестра) выставило бы второй счёт.
  const chargeId = (data as { id: string }).id
  const { error: linkErr } = await sb
    .from('class_enrollments')
    .update({ tuition_charge_id: chargeId })
    .eq('class_group_id', classGroupId)
    .eq('journey_id', journeyId)
    .is('tuition_charge_id', null)
  if (linkErr && !isMissingRelation(linkErr)) throw linkErr

  return NextResponse.json(data, { status: 201 })
}
