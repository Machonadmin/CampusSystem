import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireFoodPrivilege } from '@/lib/food/permissions'
import { mapDbError } from '@/lib/food/http'
import { activeCountByPlan, todayISO } from '@/lib/food/enrollment-server'
import type { MealPlanInsert } from '@/types/database'

/**
 * GET  /api/food/plans — планы питания + число активных записей на сегодня
 *   (пакетно, без N+1). Право: food.view.
 * POST /api/food/plans — создать план. Право: food.manage.
 */

const PLAN_SELECT =
  'id, name, code, description, includes_breakfast, includes_lunch, includes_dinner, price, period_label, is_active, created_at, updated_at'

export async function GET() {
  try {
    await requireFoodPrivilege('view')

    const sb = createServerClient()

    const { data: plans, error } = await sb
      .from('meal_plans')
      .select(PLAN_SELECT)
      .order('name', { ascending: true })
    if (error) throw error

    const rows = plans ?? []
    const counts = await activeCountByPlan(sb, rows.map(p => p.id), todayISO())

    const result = rows.map(p => ({ ...p, active_count: counts.get(p.id) ?? 0 }))

    return NextResponse.json({ plans: result })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireFoodPrivilege('manage')

    const body = await request.json() as {
      name?: string
      code?: string | null
      description?: string | null
      includes_breakfast?: boolean
      includes_lunch?: boolean
      includes_dinner?: boolean
      price?: number | null
      period_label?: string | null
    }

    const name = body.name?.trim()
    if (!name) return NextResponse.json({ error: 'name обязателен' }, { status: 400 })

    let price: number | null = null
    if (body.price !== undefined && body.price !== null) {
      price = Number(body.price)
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json({ error: 'price должен быть числом ≥ 0' }, { status: 400 })
      }
    }

    const insert: MealPlanInsert = {
      name,
      code: body.code?.trim() || null,
      description: body.description?.trim() || null,
      includes_breakfast: body.includes_breakfast ?? true,
      includes_lunch: body.includes_lunch ?? true,
      includes_dinner: body.includes_dinner ?? true,
      price,
      period_label: body.period_label?.trim() || null,
    }

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('meal_plans')
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
