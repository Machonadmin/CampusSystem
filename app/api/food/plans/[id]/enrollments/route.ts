import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireFoodPrivilege } from '@/lib/food/permissions'
import { mapDbError } from '@/lib/food/http'
import { isIsoDate } from '@/lib/food/validation'
import { canEnroll } from '@/lib/food/enrollment'
import { journeyHasActiveOverlap } from '@/lib/food/enrollment-server'
import type { MealEnrollmentInsert } from '@/types/database'

/**
 * GET  /api/food/plans/[id]/enrollments — записи на план + имя студента (view).
 * POST /api/food/plans/[id]/enrollments — записать студента (manage).
 *   Правило: у студента одна АКТИВНАЯ запись на пересекающемся диапазоне дат;
 *   409 при конфликте с понятным сообщением.
 */

// PostgREST молча обрезает выдачу на db-max-rows (~1000). Список записей плана
// читаем постранично: он и рендерится таблицей, и питает клиентский счётчик
// активных (FoodPlanDetailClient). Зеркалит пагинацию lib/food/enrollment-server.ts.
const PAGE = 1000

interface EnrollmentRow {
  id: string
  meal_plan_id: string
  journey_id: string
  enrolled_from: string
  enrolled_to: string | null
  status: string
  created_at: string
  updated_at: string
  journey: unknown
}

function studentName(row: { journey?: unknown }): { journey_id: string | null; full_name: string; hebrew_name: string | null } {
  const j = row.journey as {
    id?: string
    person?: { full_name?: string | null; hebrew_name?: string | null } | null
  } | null
  return {
    journey_id: j?.id ?? null,
    full_name: j?.person?.full_name ?? '',
    hebrew_name: j?.person?.hebrew_name ?? null,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireFoodPrivilege('view')

    const sb = createServerClient()

    const { data: plan, error: pErr } = await sb
      .from('meal_plans').select('id, name').eq('id', params.id).maybeSingle()
    if (pErr) throw pErr
    if (!plan) return NextResponse.json({ error: 'План не найден' }, { status: 404 })

    const rows: EnrollmentRow[] = []
    let offset = 0
    for (;;) {
      const { data, error } = await sb
        .from('meal_enrollments')
        .select(`
          id, meal_plan_id, journey_id, enrolled_from, enrolled_to, status, created_at, updated_at,
          journey:education_journeys!meal_enrollments_journey_id_fkey(
            id, person:persons!applicant_profiles_person_id_fkey(id, full_name, hebrew_name)
          )
        `)
        .eq('meal_plan_id', params.id)
        .order('enrolled_from', { ascending: false })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const page = (data ?? []) as EnrollmentRow[]
      rows.push(...page)
      if (page.length < PAGE) break
      offset += PAGE
    }

    const enrollments = rows.map(e => {
      const s = studentName(e)
      return {
        id: e.id,
        meal_plan_id: e.meal_plan_id,
        journey_id: e.journey_id,
        enrolled_from: e.enrolled_from,
        enrolled_to: e.enrolled_to,
        status: e.status,
        student_name: s.full_name,
        student_hebrew_name: s.hebrew_name,
      }
    })

    return NextResponse.json({ plan, enrollments })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireFoodPrivilege('manage')

    const body = await request.json() as {
      journey_id?: string
      enrolled_from?: string
      enrolled_to?: string | null
    }

    const journeyId = body.journey_id?.trim()
    if (!journeyId) return NextResponse.json({ error: 'journey_id обязателен' }, { status: 400 })

    const from = body.enrolled_from?.trim()
    if (!from || !isIsoDate(from)) {
      return NextResponse.json({ error: 'enrolled_from обязателен и должен быть датой YYYY-MM-DD' }, { status: 400 })
    }
    let to: string | null = null
    if (body.enrolled_to !== undefined && body.enrolled_to !== null && body.enrolled_to !== '') {
      to = body.enrolled_to.trim()
      if (!isIsoDate(to)) return NextResponse.json({ error: 'enrolled_to должен быть датой YYYY-MM-DD' }, { status: 400 })
      if (to < from) return NextResponse.json({ error: 'enrolled_to не может быть раньше enrolled_from' }, { status: 400 })
    }

    const sb = createServerClient()

    const { data: plan, error: pErr } = await sb
      .from('meal_plans').select('id').eq('id', params.id).maybeSingle()
    if (pErr) throw pErr
    if (!plan) return NextResponse.json({ error: 'План не найден' }, { status: 404 })

    const { data: journey, error: jErr } = await sb
      .from('education_journeys').select('id').eq('id', journeyId).maybeSingle()
    if (jErr) throw jErr
    if (!journey) return NextResponse.json({ error: 'Студент не найден' }, { status: 400 })

    // Enforce: one active meal plan per student over any overlapping date range.
    const studentOverlap = await journeyHasActiveOverlap(sb, journeyId, from, to)
    const decision = canEnroll({ studentHasActiveOverlap: studentOverlap })
    if (!decision.ok) {
      return NextResponse.json(
        { error: 'У студента уже есть активный план питания на выбранные даты', reason: decision.reason },
        { status: 409 }
      )
    }

    const insert: MealEnrollmentInsert = {
      meal_plan_id: params.id,
      journey_id: journeyId,
      enrolled_from: from,
      enrolled_to: to,
      status: 'active',
      created_by: session.person_id,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('meal_enrollments')
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
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
