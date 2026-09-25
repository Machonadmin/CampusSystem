import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { isMissingRelation, isMissingTable } from '@/lib/supabase/errors'
import { getSession } from '@/lib/auth/session'
import { canManageStaffComp, monthRange, isSelfCompTarget } from '@/lib/finance/staff-comp'
import { actualTeachingHours } from '@/lib/education/teacher-hours'
import { errorResponse } from '@/lib/api/handler'

/**
 * POST /api/staff-comp/[personId]/generate-teaching?year&month
 * Начисляет записи типа 'teaching' по ФАКТУ (решение владельца #5): только уроки
 * месяца, где отметка присутствия этого сотрудника ПОДТВЕРЖДЕНА секретариатом
 * (teacher_attendance.status='approved'), не отменённые. hours = длительность
 * урока, amount = hours × персональная hourly_rate. Расчёт часов — общий
 * lib/education/teacher-hours.ts (те же цифры, что в «מורים ושעות» и квотах).
 * Повторный запуск ПЕРЕСЧИТЫВАЕТ месяц: авто-записи teaching за месяц удаляются
 * и создаются заново. Утверждённый месяц (staff_payslips) → 409, не трогаем.
 * Право: manage. Деплой-безопасно.
 */

export async function POST(request: NextRequest, props: { params: Promise<{ personId: string }> }) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageStaffComp(session))) return apiError('forbidden', 403)
    if (isSelfCompTarget(session, params.personId)) return apiError('staff_comp_self_forbidden', 403)

    const sp = request.nextUrl.searchParams
    const year = Number(sp.get('year')), month = Number(sp.get('month'))
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return apiError('invalid_reference', 400)
    const { from, to } = monthRange(year, month)

    const sb = createServerClient()

    // Персональная ставка.
    let hourly = 0
    try {
      const { data: rate } = await sb.from('staff_compensation').select('hourly_rate').eq('person_id', params.personId).maybeSingle()
      hourly = Number((rate as { hourly_rate?: number } | null)?.hourly_rate ?? 0)
    } catch (e) { if (!isMissingTable(e)) throw e }

    // Без ставки НЕ начисляем: иначе весь месяц пишется по amount = 0, а ответ
    // выглядит успешным (и прежние записи месяца были бы удалены ниже).
    if (!(hourly > 0)) return apiError('hourly_rate_not_set', 400)

    // Месяц уже утверждён (staff_payslips.status='approved') → НЕ трогаем:
    // утверждённые/выплаченные месяцы не пересчитываются.
    try {
      const { data: ps, error: psErr } = await sb.from('staff_payslips')
        .select('status').eq('person_id', params.personId).eq('year', year).eq('month', month).maybeSingle()
      if (psErr && !isMissingTable(psErr)) throw psErr
      if ((ps as { status?: string } | null)?.status === 'approved') return apiError('payslip_month_approved', 409)
    } catch (e) { if (!isMissingTable(e)) throw e }

    // Решение владельца #5: платим по ФАКТУ — только уроки, где отметка этого
    // сотрудника подтверждена секретариатом (teacher_attendance.status='approved'),
    // не отменённые. Единый расчёт с «מורים ושעות» и квотами.
    const actual = await actualTeachingHours(sb, { from, to, teacherIds: [params.personId] })
    const mine = actual.byTeacher.get(params.personId)
    const lessons = mine?.items ?? []
    const noEndTime = mine?.no_end_time ?? 0

    // Пересчёт месяца: удаляем прежние АВТО-записи обучения этого сотрудника за
    // месяц (они могли быть начислены «по плану» — за все уроки группы) и
    // начисляем заново по факту. Иначе уникальный индекс uq_work_teaching_lesson
    // (person_id, source_lesson_id) не дал бы пересчитать. Ручные записи
    // (без source_lesson_id) не трогаем. Месяц не утверждён — проверено выше.
    const { error: delErr, count: deleted } = await sb.from('staff_work_entries')
      .delete({ count: 'exact' })
      .eq('person_id', params.personId).eq('entry_type', 'teaching')
      .not('source_lesson_id', 'is', null)
      .gte('entry_date', from).lte('entry_date', to)
    if (delErr) {
      if (isMissingRelation(delErr)) return apiError('feature_not_migrated', 503)
      throw delErr
    }

    let created = 0, skipped = 0
    for (const l of lessons) {
      const hours = l.hours
      const amount = Math.round(hours * hourly * 100) / 100
      const { error } = await sb.from('staff_work_entries')
        .insert({
          person_id: params.personId, entry_type: 'teaching', entry_date: l.date,
          hours, amount, source_lesson_id: l.lesson_id, created_by: session.person_id,
        })
      if (error) {
        const code = (error as { code?: string }).code
        if (code === '23505') { skipped++; continue }   // уже начислено за этот урок
        if (isMissingRelation(error)) return apiError('feature_not_migrated', 503)
        throw error
      }
      created++
    }

    // no_end_time — подтверждённые уроки без времени конца: не начислены (как
    // раньше), клиент показывает предупреждение.
    return NextResponse.json({ created, skipped, deleted: deleted ?? 0, no_end_time: noEndTime })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
