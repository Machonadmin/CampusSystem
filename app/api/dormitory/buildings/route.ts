import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireDormitoryPrivilege } from '@/lib/dormitory/permissions'
import { mapDbError } from '@/lib/dormitory/http'
import { loadOccupancy } from '@/lib/reports/metrics'
import type { DormBuildingInsert } from '@/types/database'
import { errorResponse } from '@/lib/api/handler'

/**
 * GET  /api/dormitory/buildings — здания + сводка занятости на сегодня
 *   (кол-во комнат, суммарная вместимость, занято, свободно). Занятость
 *   считается пакетно (без N+1) через чистые occupancy-хелперы.
 *   Право: dormitory.view.
 * POST /api/dormitory/buildings — создать здание. Право: dormitory.manage.
 */

const GENDERS = ['male', 'female', 'mixed'] as const

export async function GET() {
  try {
    await requireDormitoryPrivilege('view')

    const sb = createServerClient()

    // ЕДИНЫЙ источник с «דוחות» (/api/reports/dormitory): loadOccupancy считает
    // занятость на сегодня по каждому зданию, итог там — сумма этих же чисел.
    const { buildings: result } = await loadOccupancy(sb)

    return NextResponse.json({ buildings: result })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return errorResponse(m)
    }
    return errorResponse(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireDormitoryPrivilege('manage')

    const body = await request.json() as {
      name?: string
      code?: string | null
      gender?: string
      address?: string | null
      notes?: string | null
    }

    const name = body.name?.trim()
    if (!name) return apiError('name_field_required', 400)

    let gender: 'male' | 'female' | 'mixed' = 'mixed'
    if (body.gender !== undefined && body.gender !== null) {
      if (!(GENDERS as readonly string[]).includes(body.gender)) {
        return apiError('gender_enum', 400)
      }
      gender = body.gender as 'male' | 'female' | 'mixed'
    }

    const insert: DormBuildingInsert = {
      name,
      code: body.code?.trim() || null,
      gender,
      address: body.address?.trim() || null,
      notes: body.notes?.trim() || null,
    }

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('dorm_buildings')
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
