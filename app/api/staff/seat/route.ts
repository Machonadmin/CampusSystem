import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * POST /api/staff/seat — «посадить человека на стул» одним действием:
 * подразделение (юнит) + должность-ярлык + роль (+ глава юнита) сразу.
 *
 * Пишет:
 *   • staff_positions — department_id + position_id (+ снапшоты position_ru/he) +
 *     is_head. Если у человека уже есть активная позиция в этом подразделении —
 *     обновляем её, иначе создаём новую.
 *   • person_roles — добавляем роль (не затирая другие роли человека).
 *
 * Право: superadmin (как и назначение ролей в настройках пользователей).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!session.roles.includes('superadmin')) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as {
      person_id?: string
      department_id?: string
      position_id?: string
      role_id?: string
      is_head?: boolean
      hire_date?: string | null
    }

    if (!body.person_id) return apiError('person_required', 400)
    if (!body.department_id) return apiError('department_id_required', 400)
    if (!body.position_id) return apiError('position_required', 400)
    if (!body.role_id) return apiError('role_required', 400)

    const sb = createServerClient()

    // 1) Должность-ярлык (для снапшотов position_ru/he).
    const { data: refPos } = await sb
      .from('reference_positions')
      .select('name_ru, name_he')
      .eq('id', body.position_id)
      .maybeSingle()
    if (!refPos) return apiError('position_not_found', 400)
    const pos = refPos as { name_ru: string | null; name_he: string | null }

    // 2) Роль существует?
    const { data: role } = await sb.from('roles').select('id').eq('id', body.role_id).maybeSingle()
    if (!role) return apiError('role_not_found', 400)

    const isHead = body.is_head === true
    const hireDate = (body.hire_date && String(body.hire_date).trim())
      ? String(body.hire_date).trim()
      : new Date().toISOString().slice(0, 10)

    // 3) staff_positions — обновить активную в этом подразделении или создать.
    const { data: existing } = await sb
      .from('staff_positions')
      .select('id')
      .eq('person_id', body.person_id)
      .eq('department_id', body.department_id)
      .is('end_date', null)
      .maybeSingle()

    if (existing) {
      const { error } = await sb
        .from('staff_positions')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ position_id: body.position_id, position_ru: pos.name_ru, position_he: pos.name_he, is_head: isHead } as any)
        .eq('id', (existing as { id: string }).id)
      if (error) throw error
    } else {
      const { error } = await sb
        .from('staff_positions')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          person_id: body.person_id,
          department_id: body.department_id,
          position_id: body.position_id,
          position_ru: pos.name_ru,
          position_he: pos.name_he,
          is_head: isHead,
          start_date: hireDate,
          end_date: null,
        } as any)
      if (error) throw error
    }

    // 4) person_roles — добавить роль, если ещё не назначена.
    const { data: hasRole } = await sb
      .from('person_roles')
      .select('id')
      .eq('person_id', body.person_id)
      .eq('role_id', body.role_id)
      .maybeSingle()
    if (!hasRole) {
      const { error } = await sb
        .from('person_roles')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ person_id: body.person_id, role_id: body.role_id, assigned_by: session.person_id } as any)
      if (error) throw error
    }

    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
