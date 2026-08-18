import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import type { SubjectUpdate } from '@/types/database'

/**
 * PATCH /api/education/subjects/[id]
 * Право: manage_subjects в подразделении предмета.
 * При переносе (department_id меняется) — проверка прав в обоих подразделениях.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as {
      name?: string
      name_he?: string | null
      sort_order?: number
      is_active?: boolean
      study_track_id?: string
      year_level?: number
    }

    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('subjects')
      .select('department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return apiError('subject_not_found', 404)

    await requireEducationPrivilege('manage_subjects', { department_id: current.department_id ?? undefined })

    const update: SubjectUpdate = {}
    if (body.name !== undefined) {
      const n = body.name?.trim()
      if (!n) return apiError('title_not_empty', 400)
      update.name = n
    }
    if (body.name_he !== undefined) update.name_he = body.name_he?.trim() || null
    if (body.sort_order !== undefined) update.sort_order = body.sort_order
    if (body.is_active !== undefined) update.is_active = body.is_active
    if (body.year_level !== undefined) update.year_level = body.year_level

    // Смена маршрута → перепроверка прав в новом подразделении + перенос department.
    if (body.study_track_id !== undefined) {
      const { data: track } = await sb
        .from('study_tracks')
        .select('id, department_id')
        .eq('id', body.study_track_id)
        .single()
      if (!track) return apiError('study_track_required', 400)
      const newDept = (track as { department_id: string | null }).department_id
      if (newDept && newDept !== current.department_id) {
        await requireEducationPrivilege('manage_subjects', { department_id: newDept })
      }
      update.study_track_id = body.study_track_id
      update.department_id = newDept ?? null
    }

    if (Object.keys(update).length === 0) {
      return apiError('no_changes', 400)
    }

    const { data, error } = await sb
      .from('subjects')
      .update(update)
      .eq('id', params.id)
      .select('*, department:departments(id, name)')
      .single()

    if (error) {
      if (error.code === '23505') return apiError('subject_exists', 409)
      if (error.code === '23503') return apiError('department_id_invalid', 400)
      throw error
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

/**
 * DELETE /api/education/subjects/[id]
 * Право: manage_subjects в подразделении предмета.
 * FK ON DELETE RESTRICT из class_groups → 409.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('subjects')
      .select('department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return apiError('subject_not_found', 404)

    await requireEducationPrivilege('manage_subjects', { department_id: current.department_id ?? undefined })

    const { error } = await sb.from('subjects').delete().eq('id', params.id)
    if (error) {
      if (error.code === '23503') {
        return apiError('cannot_delete_subject_has_groups', 409)
      }
      throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
