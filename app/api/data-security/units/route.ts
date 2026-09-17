import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { getCookieLocale } from '@/lib/i18n/locale'
import { createServerClient } from '@/lib/supabase/server'
import { todayISO } from '@/lib/dates'
import { requireDataSecurityPrivilege } from '@/lib/data-security/permissions'
import { buildUnitTree, seatReach, type DepartmentInput, type SeatInput } from '@/lib/data-security/units'

/**
 * Учебные единицы — НАСТОЯЩАЯ граница доступа.
 *
 *   GET    — дерево единиц с числом посаженных.
 *   POST   — создать единицу (например «Колледж · 3 года» под «Колледжем»).
 *   PATCH  — переименовать или перенести.
 *   DELETE — удалить пустую единицу.
 *
 * ⚠ В отличие от маршрутов дерева ОТОБРАЖЕНИЯ (tree/route.ts), здесь правка
 * МЕНЯЕТ ДОСТУП: посаженный на единицу видит её и всё, что ниже, поэтому
 * перенос единицы немедленно меняет то, что видят люди под ней. Право отдельное
 * — data_security.manage_units, — и склеивать его с manage_tree нельзя.
 */

const DEPT_COLUMNS =
  'id, name, name_he, name_en, parent_id, head_person_id, sort_order, is_educational_institution'

async function loadUnits(lang: ReturnType<typeof getCookieLocale>) {
  const sb = createServerClient()
  const [deptRes, seatRes] = await Promise.all([
    sb.from('departments').select(DEPT_COLUMNS).order('name'),
    sb.from('staff_positions').select('person_id, department_id, is_head, end_date'),
  ])
  if (deptRes.error) throw deptRes.error
  if (seatRes.error) throw seatRes.error

  const departments = (deptRes.data ?? []) as unknown as DepartmentInput[]
  const seats = (seatRes.data ?? []) as unknown as SeatInput[]
  return {
    units: buildUnitTree(lang, departments, seats, todayISO()),
    departments,
  }
}

export async function GET() {
  try {
    await requireDataSecurityPrivilege('access')
    const { units } = await loadUnits(getCookieLocale())
    return NextResponse.json({ units })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

interface UnitBody {
  id?: string
  parent_id?: string | null
  name?: string        // русское название — оно же значение по умолчанию
  name_he?: string
  name_en?: string | null
}

export async function POST(request: NextRequest) {
  try {
    await requireDataSecurityPrivilege('manage_units')
    const sb = createServerClient()
    const body = await request.json() as UnitBody

    // Ивритское имя обязательно: технического идентификатора на экране быть
    // не должно, а единица без подписи — пустая строка в списке областей.
    const nameHe = body.name_he?.trim()
    if (!nameHe) return apiError('required_fields', 400)

    const { error } = await sb.from('departments').insert({
      name: body.name?.trim() || nameHe,
      name_he: nameHe,
      name_en: body.name_en?.trim() || null,
      parent_id: body.parent_id ?? null,
      head_person_id: null,
    })
    if (error) throw error

    const { units } = await loadUnits(getCookieLocale())
    return NextResponse.json({ units })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireDataSecurityPrivilege('manage_units')
    const sb = createServerClient()
    const body = await request.json() as UnitBody
    if (!body.id) return apiError('invalid_reference', 400)

    // Перенос единицы внутрь собственного потомка оборвал бы обход дерева, а
    // расчёт области зациклился бы. У departments триггера от петли нет
    // (в отличие от дерева отображения), поэтому проверяем здесь.
    if (body.parent_id !== undefined && body.parent_id !== null) {
      if (body.parent_id === body.id) return apiError('invalid_reference', 400)
      const { data: all } = await sb.from('departments').select('id, parent_id')
      const parentOf = new Map((all ?? []).map(d => [d.id, d.parent_id as string | null]))
      let cur: string | null = body.parent_id
      const guard = new Set<string>([body.id])
      while (cur) {
        if (guard.has(cur)) return apiError('invalid_reference', 400)
        guard.add(cur)
        cur = parentOf.get(cur) ?? null
      }
    }

    const patch: Record<string, unknown> = {}
    if (body.name_he !== undefined) {
      const v = body.name_he.trim()
      if (!v) return apiError('required_fields', 400)
      patch.name_he = v
    }
    if (body.name !== undefined) patch.name = body.name.trim() || undefined
    if (body.name_en !== undefined) patch.name_en = body.name_en?.trim() || null
    if (body.parent_id !== undefined) patch.parent_id = body.parent_id
    if (Object.keys(patch).length === 0) return apiError('invalid_reference', 400)

    const { error } = await sb.from('departments').update(patch).eq('id', body.id)
    if (error) throw error

    const { units } = await loadUnits(getCookieLocale())
    return NextResponse.json({ units })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireDataSecurityPrivilege('manage_units')
    const sb = createServerClient()
    const id = request.nextUrl.searchParams.get('id')
    if (!id) return apiError('invalid_reference', 400)

    // Единицу с людьми или с потомками не удаляем: люди потеряли бы область
    // молча, а потомки — родителя. Сначала пересадить и перенести.
    const [{ data: kids }, { data: seats }] = await Promise.all([
      sb.from('departments').select('id').eq('parent_id', id).limit(1),
      sb.from('staff_positions').select('person_id').eq('department_id', id).is('end_date', null).limit(1),
    ])
    if ((kids ?? []).length > 0) return apiError('structure_has_children', 409)
    if ((seats ?? []).length > 0) return apiError('structure_has_groups', 409)

    const { error } = await sb.from('departments').delete().eq('id', id)
    if (error) throw error

    const { units } = await loadUnits(getCookieLocale())
    return NextResponse.json({ units })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/** Что откроет посадка на набор единиц — подписями, для предпросмотра на экране. */
export async function PUT(request: NextRequest) {
  try {
    await requireDataSecurityPrivilege('access')
    const { department_ids } = await request.json() as { department_ids?: string[] }
    if (!Array.isArray(department_ids)) return apiError('invalid_reference', 400)
    const sb = createServerClient()
    const { data } = await sb.from('departments').select(DEPT_COLUMNS)
    const reach = seatReach(getCookieLocale(), (data ?? []) as unknown as DepartmentInput[], department_ids)
    return NextResponse.json(reach)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
