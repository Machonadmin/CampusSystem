import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import type { StudyGroupUpdate } from '@/types/database'

/**
 * PATCH /api/education/study-groups/[id]
 * Право: manage_study_groups в подразделении группы.
 * При переносе между подразделениями — проверка в обоих.
 * При смене specialty_id — проверка консистентности с (новым) department_id.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as {
      name?: string
      name_he?: string | null
      year_level?: number | null
      year_start?: number | null
      notes?: string | null
      is_active?: boolean
      department_id?: string
      specialty_id?: string | null
    }

    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('study_groups')
      .select('department_id, specialty_id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return apiError('group_not_found', 404)

    await requireEducationPrivilege('manage_study_groups', { department_id: current.department_id })

    const newDepartmentId = body.department_id ?? current.department_id
    if (body.department_id && body.department_id !== current.department_id) {
      await requireEducationPrivilege('manage_study_groups', { department_id: body.department_id })
    }

    if (body.specialty_id !== undefined && body.specialty_id !== null) {
      const { data: spec, error: specErr } = await sb
        .from('specialties')
        .select('department_id')
        .eq('id', body.specialty_id)
        .maybeSingle()
      if (specErr) throw specErr
      if (!spec) return apiError('specialty_not_found', 400)
      if (spec.department_id !== newDepartmentId) {
        return apiError('specialty_other_department', 400)
      }
    }

    const update: StudyGroupUpdate = {}
    if (body.name !== undefined) {
      const n = body.name?.trim()
      if (!n) return apiError('title_not_empty', 400)
      update.name = n
    }
    if (body.name_he !== undefined) update.name_he = body.name_he?.trim() || null
    if (body.year_level !== undefined) update.year_level = body.year_level
    if (body.year_start !== undefined) update.year_start = body.year_start
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null
    if (body.is_active !== undefined) update.is_active = body.is_active
    if (body.department_id !== undefined) update.department_id = body.department_id
    if (body.specialty_id !== undefined) update.specialty_id = body.specialty_id

    if (Object.keys(update).length === 0) {
      return apiError('no_changes', 400)
    }

    const { data, error } = await sb
      .from('study_groups')
      .update(update)
      .eq('id', params.id)
      .select('*, department:departments(id, name), specialty:specialties(id, name, code)')
      .single()

    if (error) {
      if (error.code === '23505') return apiError('group_name_exists', 409)
      if (error.code === '23503') return apiError('invalid_reference_dept_or_specialty', 400)
      throw error
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/**
 * DELETE /api/education/study-groups/[id]
 * Право: manage_study_groups в подразделении группы.
 * Отказывает (409) если есть активные студенты — нужно сначала перевести их.
 * (students.main_group_id имеет ON DELETE SET NULL, но молчаливое обнуление нежелательно.)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('study_groups')
      .select('department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return apiError('group_not_found', 404)

    await requireEducationPrivilege('manage_study_groups', { department_id: current.department_id })

    const { count: studentsCount, error: cntErr } = await sb
      .from('students')
      .select('id', { count: 'exact', head: true })
      .eq('main_group_id', params.id)
      .eq('status', 'active')

    if (cntErr) throw cntErr

    if (studentsCount && studentsCount > 0) {
      return NextResponse.json(
        { error: `Нельзя удалить группу — в ней ${studentsCount} активных студентов. Переведите их в другую группу или деактивируйте группу (is_active=false).` },
        { status: 409 }
      )
    }

    const { error } = await sb.from('study_groups').delete().eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
