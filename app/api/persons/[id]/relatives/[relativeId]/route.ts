import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requirePrivilege } from '@/lib/auth/module-privileges'
import type { PersonRelativeUpdate, RelationType } from '@/types/database'

function mapDbError(error: { code?: string; message?: string }) {
  if (error.code === '23505') return { status: 409, message: 'Такая связь уже существует' }
  if (error.code === '23503') return { status: 400, message: 'Person или relative не существует' }
  if (error.code === '23514') return { status: 400, message: 'Нельзя добавить самого себя как relative' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

/**
 * DELETE /api/persons/[id]/relatives/[relativeId]
 * Удалить связь между person и relative. Person не удаляется.
 *
 * Опционально ?relation_type=... — удалить только указанный тип отношения.
 * Без параметра — удалить ВСЕ связи между этой парой persons.
 *
 * Ответ: { ok: true, deleted: <count> }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; relativeId: string } }
) {
  try {
    await requirePrivilege('persons', 'edit')
    const sb = createServerClient()

    let qb = sb
      .from('person_relatives')
      .delete()
      .eq('person_id', params.id)
      .eq('relative_id', params.relativeId)

    const relationType = request.nextUrl.searchParams.get('relation_type') as RelationType | null
    if (relationType) qb = qb.eq('relation_type', relationType)

    const { data, error } = await qb.select('id')
    if (error) throw error

    return NextResponse.json({ ok: true, deleted: data?.length ?? 0 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

/**
 * PATCH /api/persons/[id]/relatives/[relativeId]
 * Query: ?relation_type=... (текущий тип связи; обязателен если их несколько)
 * Body: { relation_type?, notes? }
 *
 * Если меняется relation_type — это переименование. БД проверит UNIQUE
 * на (person_id, relative_id, relation_type).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; relativeId: string } }
) {
  try {
    await requirePrivilege('persons', 'edit')
    const body = await request.json() as {
      relation_type?: RelationType
      notes?: string | null
    }

    if (body.relation_type === undefined && body.notes === undefined) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    const sb = createServerClient()

    const update: PersonRelativeUpdate = {}
    if (body.relation_type !== undefined) update.relation_type = body.relation_type
    if (body.notes !== undefined) update.notes = body.notes === null ? null : (body.notes.trim() || null)

    let qb = sb
      .from('person_relatives')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(update as any)
      .eq('person_id', params.id)
      .eq('relative_id', params.relativeId)

    const currentType = request.nextUrl.searchParams.get('relation_type') as RelationType | null
    if (currentType) qb = qb.eq('relation_type', currentType)

    const { data, error } = await qb.select(`
      id, person_id, relative_id, relation_type, notes, created_at,
      relative:persons!person_relatives_relative_id_fkey(id, full_name, email, phones)
    `)
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Связь не найдена' }, { status: 404 })
    }

    return NextResponse.json({ updated: data.length, relatives: data })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
