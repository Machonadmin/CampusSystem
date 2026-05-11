import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import type { SpecialtyUpdate } from '@/types/database'

/**
 * PATCH /api/education/specialties/[id]
 * Право: manage_specialties в подразделении специальности.
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
      code?: string | null
      sort_order?: number
      is_active?: boolean
      department_id?: string
    }

    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('specialties')
      .select('department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return NextResponse.json({ error: 'Специальность не найдена' }, { status: 404 })

    await requireEducationPrivilege('manage_specialties', { department_id: current.department_id })

    if (body.department_id && body.department_id !== current.department_id) {
      await requireEducationPrivilege('manage_specialties', { department_id: body.department_id })
    }

    if (body.code !== undefined && body.code !== null && body.code.length > 50) {
      return NextResponse.json({ error: 'Код не может быть длиннее 50 символов' }, { status: 400 })
    }

    const update: SpecialtyUpdate = {}
    if (body.name !== undefined) {
      const n = body.name?.trim()
      if (!n) return NextResponse.json({ error: 'Название не может быть пустым' }, { status: 400 })
      update.name = n
    }
    if (body.name_he !== undefined) update.name_he = body.name_he?.trim() || null
    if (body.code !== undefined) update.code = body.code?.trim() || null
    if (body.sort_order !== undefined) update.sort_order = body.sort_order
    if (body.is_active !== undefined) update.is_active = body.is_active
    if (body.department_id !== undefined) update.department_id = body.department_id

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    const { data, error } = await sb
      .from('specialties')
      .update(update)
      .eq('id', params.id)
      .select('*, department:departments(id, name)')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Специальность с таким названием уже есть в этом подразделении' },
          { status: 409 }
        )
      }
      if (error.code === '23503') return NextResponse.json({ error: 'department_id некорректен' }, { status: 400 })
      throw error
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

/**
 * DELETE /api/education/specialties/[id]
 * Право: manage_specialties в подразделении специальности.
 * FK из study_groups.specialty_id и students.specialty_id → 409.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('specialties')
      .select('department_id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return NextResponse.json({ error: 'Специальность не найдена' }, { status: 404 })

    await requireEducationPrivilege('manage_specialties', { department_id: current.department_id })

    const { error } = await sb.from('specialties').delete().eq('id', params.id)
    if (error) {
      if (error.code === '23503') {
        return NextResponse.json(
          { error: 'Нельзя удалить специальность, к которой привязаны группы или студенты.' },
          { status: 409 }
        )
      }
      throw error
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
