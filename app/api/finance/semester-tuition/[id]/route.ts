import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { isMissingRelation } from '@/lib/supabase/errors'
import { requireFinancePrivilege } from '@/lib/finance/permissions'
import { ensureSemesterTuitionCharges } from '@/lib/education/semester-tuition'

/**
 * PATCH /api/finance/semester-tuition/[id]
 * Финансы задают школьную плату (שכר לימוד) реального семестра (class_groups
 * с is_semester=true) и тем самым порождают счета tuition для уже зачисленных
 * студенток. Право: finance.create_invoice.
 *
 * Идемпотентно: ensureSemesterTuitionCharges не создаёт повторный счёт студентке,
 * у которой он уже есть (class_enrollments.tuition_charge_id). Изменение суммы
 * НЕ переписывает уже выставленные счета (как и в легаси-потоке semesters) — она
 * применяется к тем, у кого счёта ещё нет.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireFinancePrivilege('create_invoice')
    const body = await request.json().catch(() => ({})) as { tuition_amount?: number | null }

    if (body.tuition_amount === undefined) return apiError('no_changes', 400)
    let amount: number | null = null
    if (body.tuition_amount !== null) {
      const n = Number(body.tuition_amount)
      if (!Number.isFinite(n) || n < 0) return apiError('amount_number_gte_0', 400)
      amount = n
    }

    const sb = createServerClient()

    // Проверяем, что это семестр-группа, и берём поля для метки счёта.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gRes = await (sb
      .from('class_groups')
      .select('id, name, year_label, term_number, is_semester')
      .eq('id', params.id)
      .maybeSingle() as any)
    if (gRes.error) {
      if (isMissingRelation(gRes.error)) return apiError('feature_not_migrated', 503)
      throw gRes.error
    }
    if (!gRes.data || gRes.data.is_semester !== true) return apiError('not_found', 404)
    const group = gRes.data as { id: string; name: string | null; year_label: string | null; term_number: number | null }

    // (1) Обновляем сумму на семестре.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr } = await (sb.from('class_groups').update({ tuition_amount: amount } as any).eq('id', params.id) as any)
    if (upErr) {
      if (upErr.code === '42703') return apiError('feature_not_migrated', 503)
      throw upErr
    }

    // (2) Порождаем счета tuition для уже зачисленных студенток (идемпотентно).
    let created = 0
    let warning: string | undefined
    if (amount != null && amount > 0) {
      const { data: enrolls, error: eErr } = await sb
        .from('class_enrollments')
        .select('journey_id')
        .eq('class_group_id', params.id)
      if (eErr) throw eErr
      const journeyIds = [...new Set((enrolls ?? []).map(r => r.journey_id))]
      if (journeyIds.length > 0) {
        const res = await ensureSemesterTuitionCharges(
          sb,
          { id: group.id, tuition_amount: amount, name: group.name, year_label: group.year_label, term_number: group.term_number },
          journeyIds,
          session.person_id,
        )
        created = res.created
        warning = res.warning
      }
    }

    return NextResponse.json({ ok: true, id: params.id, tuition_amount: amount, charges_created: created, ...(warning ? { warning } : {}) })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
