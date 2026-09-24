import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canViewStaffComp } from '@/lib/finance/staff-comp'
import { isMissingTable } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'

/**
 * Хеврута-плюс: пары мора↔ученица этого сотрудника — ТОЛЬКО ЧТЕНИЕ.
 *   GET → { assignments: [{ id, student_journey_id, student_name, is_active }],
 *          rate, basis } (право view).
 *
 * Решение владельца #6: «החברותא עצמו מנוהל בחברותא ובכספים מתעסקים בכספים».
 * Пары ведутся ТОЛЬКО в «מרכז חברותא» (/dashboard/education/chavruta, таблица
 * chavruta_pairs); каждая активная пара оплачивается как хеврута-плюс. Финансы
 * здесь только показывают пары и тариф — добавление/снятие пар (POST/DELETE)
 * удалено. Старая таблица chavruta_plus_assignments больше не читается (не
 * тронута). Тариф/базис — из staff_compensation. Начисление — generate-chavruta-plus.
 * Деплой-безопасно (42P01).
 */

export async function GET(_request: NextRequest, props: { params: Promise<{ personId: string }> }) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canViewStaffComp(session))) return apiError('forbidden', 403)

    const sb = createServerClient()

    // Тариф/базис.
    let rate = 0, basis = 'per_student_month'
    try {
      const { data } = await sb.from('staff_compensation')
        .select('chavruta_plus_rate, chavruta_plus_basis').eq('person_id', params.personId).maybeSingle()
      const c = data as { chavruta_plus_rate?: number; chavruta_plus_basis?: string } | null
      rate = Number(c?.chavruta_plus_rate ?? 0)
      basis = c?.chavruta_plus_basis ?? 'per_student_month'
    } catch (e) { if (!isMissingTable(e)) throw e }

    // Пары.
    let rows: Array<{ id: string; student_journey_id: string; is_active: boolean }> = []
    try {
      const { data, error } = await sb.from('chavruta_pairs')
        .select('id, student_journey_id, is_active').eq('teacher_person_id', params.personId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
      if (error) throw error
      rows = (data ?? []) as typeof rows
    } catch (e) {
      if (isMissingTable(e)) return NextResponse.json({ assignments: [], rate, basis })
      throw e
    }

    // Имена учениц.
    const journeyIds = [...new Set(rows.map(r => r.student_journey_id))]
    const nameById = new Map<string, string>()
    if (journeyIds.length) {
      const { data: js } = await sb.from('education_journeys')
        .select('id, person:persons!applicant_profiles_person_id_fkey(full_name, hebrew_name)')
        .in('id', journeyIds)
      for (const j of (js ?? []) as Array<{ id: string; person: { full_name?: string | null; hebrew_name?: string | null } | null }>) {
        nameById.set(j.id, (j.person?.hebrew_name || j.person?.full_name || '').trim())
      }
    }

    const assignments = rows.map(r => ({
      id: r.id,
      student_journey_id: r.student_journey_id,
      student_name: nameById.get(r.student_journey_id) ?? '',
      is_active: r.is_active,
    }))
    return NextResponse.json({ assignments, rate, basis })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
