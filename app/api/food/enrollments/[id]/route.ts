import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireFoodPrivilege } from '@/lib/food/permissions'
import { mapDbError } from '@/lib/food/http'
import { isIsoDate } from '@/lib/food/validation'
import { canEnroll } from '@/lib/food/enrollment'
import { journeyHasActiveOverlap } from '@/lib/food/enrollment-server'
import type { MealEnrollmentUpdate } from '@/types/database'

/**
 * PATCH /api/food/enrollments/[id] — завершить запись (status='ended' +
 *   enrolled_to) или изменить даты. Право: food.manage. Если после правки
 *   запись остаётся активной — заново проверяется правило «одна активная
 *   запись на пересекающемся диапазоне» (исключая саму запись); 409 при
 *   конфликте.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireFoodPrivilege('manage')

    const body = await request.json() as {
      enrolled_from?: string
      enrolled_to?: string | null
      status?: string
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('meal_enrollments')
      .select('id, journey_id, enrolled_from, enrolled_to, status')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 })

    const update: MealEnrollmentUpdate = {}

    if (body.enrolled_from !== undefined) {
      const f = body.enrolled_from?.trim()
      if (!f || !isIsoDate(f)) return NextResponse.json({ error: 'enrolled_from должен быть датой YYYY-MM-DD' }, { status: 400 })
      update.enrolled_from = f
    }
    if (body.enrolled_to !== undefined) {
      if (body.enrolled_to === null || body.enrolled_to === '') update.enrolled_to = null
      else {
        const t = body.enrolled_to.trim()
        if (!isIsoDate(t)) return NextResponse.json({ error: 'enrolled_to должен быть датой YYYY-MM-DD' }, { status: 400 })
        update.enrolled_to = t
      }
    }
    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'ended') {
        return NextResponse.json({ error: "status должен быть 'active' или 'ended'" }, { status: 400 })
      }
      update.status = body.status
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    // Итоговые значения после правки.
    const finalStatus = update.status ?? existing.status
    const finalFrom = update.enrolled_from ?? existing.enrolled_from
    const finalTo = update.enrolled_to !== undefined ? update.enrolled_to : existing.enrolled_to

    if (finalTo !== null && finalTo < finalFrom) {
      return NextResponse.json({ error: 'enrolled_to не может быть раньше enrolled_from' }, { status: 400 })
    }

    // Пере-проверка правила ТОЛЬКО если запись остаётся активной.
    if (finalStatus === 'active') {
      const overlap = await journeyHasActiveOverlap(sb, existing.journey_id, finalFrom, finalTo, existing.id)
      const decision = canEnroll({ studentHasActiveOverlap: overlap })
      if (!decision.ok) {
        return NextResponse.json(
          { error: 'У студента уже есть активный план питания на выбранные даты', reason: decision.reason },
          { status: 409 }
        )
      }
    }

    const { data, error } = await sb
      .from('meal_enrollments')
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
