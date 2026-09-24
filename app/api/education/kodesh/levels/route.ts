import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageKodesh } from '@/lib/education/kodesh-access'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { KODESH_DEPT_ID } from '@/lib/education/kodesh-exceptions'
import { isMissingColumn, isMissingTable } from '@/lib/supabase/errors'

/**
 * Уровни кодеша (רמות) = class_groups кафедры иудаики с parent_semester_id IS NULL.
 *
 * GET  — СКРЫТЫЕ уровни (is_active=false): история, видна тем, кто управляет
 *        кодешем (решение владельца 2026-09-23: уровень не удаляют, а скрывают).
 * POST — создать уровень. Body: { name_he }. Только название (решение владельца):
 *        kodesh_level / kodesh_stream не задаются → «Переход года» такой уровень
 *        пропускает, пока номер не проставлен.
 */

export async function GET(_request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageKodesh(session))) return apiError('forbidden', 403)

    const sb = createServerClient()
    const { data, error } = await sb
      .from('class_groups')
      .select('id, name, name_he, name_en')
      .eq('department_id', KODESH_DEPT_ID)
      .eq('is_active', false)
      .is('parent_semester_id', null)
      .order('name_he', { nullsFirst: false })
      .order('name')
    if (error) {
      if (isMissingTable(error) || isMissingColumn(error)) return NextResponse.json({ levels: [] })
      throw error
    }
    return NextResponse.json({ levels: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name_he?: string }
    const name = body.name_he?.trim()
    if (!name) return apiError('title_required', 400)

    // То же право, что и у переименования уровня (PATCH class-groups/[id]).
    await requireEducationPrivilege('manage_class_groups', { department_id: KODESH_DEPT_ID })

    const sb = createServerClient()

    // Предмет «קודש», как у уровней из миграции 20260903100000; нет — без предмета
    // (subject_id nullable с 20260720150000).
    const { data: subj, error: subjErr } = await sb
      .from('subjects')
      .select('id')
      .eq('name', 'קודש')
      .limit(1)
      .maybeSingle()
    if (subjErr) throw subjErr

    // name (RU) обязателен в таблице — кладём то же еврейское название, как делает
    // переименование на этом экране (оно меняет только name_he).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from('class_groups') as any)
      .insert({
        name,
        name_he: name,
        department_id: KODESH_DEPT_ID,
        subject_id: subj?.id ?? null,
        is_semester: false,
        is_active: true,
      })
      .select('id, name, name_he, name_en')
      .single()
    if (error) {
      if (error.code === '23505') return apiError('group_name_exists', 409)
      throw error
    }

    return NextResponse.json({ ...data, kodesh_level: null, kodesh_stream: null }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
