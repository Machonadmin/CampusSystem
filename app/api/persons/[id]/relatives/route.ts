import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requirePrivilege } from '@/lib/auth/module-privileges'
import type { PersonRelativeInsert, RelationType } from '@/types/database'

function mapDbError(error: { code?: string; message?: string }) {
  if (error.code === '23505') return { status: 409, message: 'Такая связь уже существует' }
  if (error.code === '23503') return { status: 400, message: 'Person или relative не существует' }
  if (error.code === '23514') return { status: 400, message: 'Нельзя добавить самого себя как relative' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

/**
 * GET /api/persons/[id]/relatives
 * Все связи person.
 * Опционально ?relation_type=... — фильтр по типу.
 *
 * Ответ: [{ id, relation_type, notes, created_at,
 *           relative: { id, full_name, email, phone } }]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requirePrivilege('persons', 'view')
    const sb = createServerClient()

    let qb = sb
      .from('person_relatives')
      .select(`
        id, person_id, relative_id, relation_type, notes, created_at,
        relative:persons!person_relatives_relative_id_fkey(id, full_name, email, phones)
      `)
      .eq('person_id', params.id)
      .order('created_at', { ascending: true })

    const relationType = request.nextUrl.searchParams.get('relation_type') as RelationType | null
    if (relationType) qb = qb.eq('relation_type', relationType)

    const { data, error } = await qb
    if (error) throw error

    const relatives = (data ?? []).map(row => {
      const r = (row.relative as unknown) as {
        id: string
        full_name: string | null
        email: string | null
        phones: unknown
      } | null
      const phone = Array.isArray(r?.phones) && r!.phones.length > 0
        ? (typeof r!.phones[0] === 'string'
            ? (r!.phones[0] as string)
            : ((r!.phones[0] as { number?: string })?.number ?? null))
        : null
      return {
        id: row.id,
        relation_type: row.relation_type as RelationType,
        notes: row.notes,
        created_at: row.created_at,
        relative: r
          ? { id: r.id, full_name: r.full_name, email: r.email, phone }
          : null,
      }
    })

    return NextResponse.json({ relatives })
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
 * POST /api/persons/[id]/relatives
 * Body: { relative_id, relation_type, notes? }
 * Право: persons.edit
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requirePrivilege('persons', 'edit')
    const body = await request.json() as {
      relative_id?: string
      relation_type?: RelationType
      notes?: string
    }

    if (!body.relative_id) {
      return NextResponse.json({ error: 'relative_id обязателен' }, { status: 400 })
    }
    if (!body.relation_type) {
      return NextResponse.json({ error: 'relation_type обязателен' }, { status: 400 })
    }
    if (body.relative_id === params.id) {
      return NextResponse.json({ error: 'Нельзя добавить самого себя как relative' }, { status: 400 })
    }

    const sb = createServerClient()
    const insert: PersonRelativeInsert = {
      person_id: params.id,
      relative_id: body.relative_id,
      relation_type: body.relation_type,
      notes: body.notes?.trim() || null,
    }

    const { data, error } = await sb
      .from('person_relatives')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(insert as any)
      .select(`
        id, person_id, relative_id, relation_type, notes, created_at,
        relative:persons!person_relatives_relative_id_fkey(id, full_name, email, phones)
      `)
      .single()

    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
