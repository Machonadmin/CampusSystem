import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireFoodPrivilege } from '@/lib/food/permissions'
import { mapDbError } from '@/lib/food/http'
import { activeCountByPlan, todayISO } from '@/lib/food/enrollment-server'
import type { MealPlanUpdate } from '@/types/database'

/**
 * GET    /api/food/plans/[id] — план + число активных записей (view)
 * PATCH  /api/food/plans/[id] — правка плана (manage)
 * DELETE /api/food/plans/[id] — удаление, каскадом записи (manage)
 */

const PLAN_SELECT =
  'id, name, code, description, includes_breakfast, includes_lunch, includes_dinner, price, period_label, is_active, created_at, updated_at'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireFoodPrivilege('view')

    const sb = createServerClient()

    const { data: plan, error } = await sb
      .from('meal_plans').select(PLAN_SELECT).eq('id', params.id).maybeSingle()
    if (error) throw error
    if (!plan) return NextResponse.json({ error: 'План не найден' }, { status: 404 })

    const counts = await activeCountByPlan(sb, [params.id], todayISO())

    return NextResponse.json({ ...plan, active_count: counts.get(params.id) ?? 0 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
      is_active?: boolean
    }

    const update: MealPlanUpdate = {}
    if (body.name !== undefined) {
      const n = body.name?.trim()
      if (!n) return NextResponse.json({ error: 'name не может быть пустым' }, { status: 400 })
      update.name = n
    }
    if (body.code !== undefined) update.code = body.code?.trim() || null
    if (body.description !== undefined) update.description = body.description?.trim() || null
    if (body.includes_breakfast !== undefined) update.includes_breakfast = !!body.includes_breakfast
    if (body.includes_lunch !== undefined) update.includes_lunch = !!body.includes_lunch
    if (body.includes_dinner !== undefined) update.includes_dinner = !!body.includes_dinner
    if (body.price !== undefined) {
      if (body.price === null) update.price = null
      else {
        const p = Number(body.price)
        if (!Number.isFinite(p) || p < 0) return NextResponse.json({ error: 'price должен быть числом ≥ 0' }, { status: 400 })
        update.price = p
      }
    }
    if (body.period_label !== undefined) update.period_label = body.period_label?.trim() || null
    if (body.is_active !== undefined) update.is_active = !!body.is_active

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('meal_plans').select('id').eq('id', params.id).maybeSingle()
    if (exErr) throw exErr
    if (!existing) return NextResponse.json({ error: 'План не найден' }, { status: 404 })

    const { data, error } = await sb
      .from('meal_plans')
      .update(update)
      .eq('id', params.id)
      .select('*')
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
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
    await requireFoodPrivilege('manage')

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('meal_plans').select('id').eq('id', params.id).maybeSingle()
    if (exErr) throw exErr
    if (!existing) return NextResponse.json({ error: 'План не найден' }, { status: 404 })

    const { error } = await sb.from('meal_plans').delete().eq('id', params.id)
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
