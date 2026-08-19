import { NextRequest, NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireFoodPrivilege } from '@/lib/food/permissions'
import { mapDbError } from '@/lib/food/http'
import { isActiveOn, type Enrollment } from '@/lib/food/enrollment'
import { todayISO } from '@/lib/food/enrollment-server'

/**
 * GET /api/food/journeys/[id] — текущая запись студента + история + диет-профиль.
 *   [id] = journey_id. Право: food.view.
 *   Ответ: { current, history[], dietary } — current активна на сегодня (или null).
 */

interface PlanJoin { id?: string; name?: string | null }

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireFoodPrivilege('view')

    const sb = createServerClient()

    const { data, error } = await sb
      .from('meal_enrollments')
      .select(`
        id, meal_plan_id, journey_id, enrolled_from, enrolled_to, status, created_at, updated_at,
        plan:meal_plans!meal_enrollments_meal_plan_id_fkey(id, name)
      `)
      .eq('journey_id', params.id)
      .order('enrolled_from', { ascending: false })
    if (error) throw error

    const today = todayISO()
    const rows = (data ?? []).map(e => {
      const plan = e.plan as PlanJoin | null
      return {
        id: e.id,
        meal_plan_id: e.meal_plan_id,
        enrolled_from: e.enrolled_from,
        enrolled_to: e.enrolled_to,
        status: e.status,
        plan_name: plan?.name ?? null,
      }
    })

    const current = rows.find(r =>
      isActiveOn({ enrolled_from: r.enrolled_from, enrolled_to: r.enrolled_to, status: r.status } as Enrollment, today)
    ) ?? null

    const { data: dietary, error: dErr } = await sb
      .from('dietary_profiles')
      .select('id, journey_id, restrictions, allergies, notes, created_at, updated_at')
      .eq('journey_id', params.id)
      .maybeSingle()
    if (dErr) throw dErr

    return NextResponse.json({ current, history: rows, dietary: dietary ?? null })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
