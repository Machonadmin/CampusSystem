import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import type { CommunityUpdate } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

function mapDbError(error: { code?: string; message?: string }) {
  if (error.code === '23505') return { status: 409, message: 'Община с таким названием в этом городе уже существует' }
  if (error.code === '23503') return { status: 400, message: 'Ссылка на несуществующую запись' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

/**
 * GET /api/education/communities/[id]
 * Детали общины + количество связанных journeys.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth()
    const sb = createServerClient()

    const [{ data: community, error: cErr }, { count, error: jcErr }] = await Promise.all([
      sb.from('communities').select('*').eq('id', params.id).maybeSingle(),
      sb.from('journey_communities')
        .select('*', { count: 'exact', head: true })
        .eq('community_id', params.id),
    ])

    if (cErr) throw cErr
    if (!community) return NextResponse.json({ error: 'Община не найдена' }, { status: 404 })
    if (jcErr) throw jcErr

    return NextResponse.json({ ...community, journey_count: count ?? 0 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

/**
 * PATCH /api/education/communities/[id]
 * Право: education.manage_communities (общины — общий ресурс без подразделения,
 * проверка без target → нужен scope='all').
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireEducationPrivilege('manage_communities')
    const body = await request.json() as Partial<CommunityUpdate>
    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('communities')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return NextResponse.json({ error: 'Община не найдена' }, { status: 404 })

    const update: CommunityUpdate = {}
    if (body.name !== undefined) update.name = body.name?.trim() || undefined
    if (body.name_he !== undefined) update.name_he = body.name_he?.trim() || null
    if (body.country !== undefined) update.country = body.country?.trim() || undefined
    if (body.city !== undefined) update.city = body.city?.trim() || undefined
    if (body.default_contact_name !== undefined) update.default_contact_name = body.default_contact_name?.trim() || null
    if (body.default_contact_role !== undefined) update.default_contact_role = body.default_contact_role?.trim() || null
    if (body.default_contact_phone !== undefined) update.default_contact_phone = body.default_contact_phone?.trim() || null
    if (body.default_contact_email !== undefined) update.default_contact_email = body.default_contact_email?.trim() || null
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null
    if (body.is_active !== undefined) update.is_active = body.is_active

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    const { data, error } = await sb
      .from('communities')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(update as any)
      .eq('id', params.id)
      .select('*')
      .single()

    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

/**
 * DELETE /api/education/communities/[id]
 * Мягкое удаление: is_active = false.
 * Право: education.manage_communities (проверка без target → нужен scope='all').
 * Физически удалить нельзя, пока есть связанные journey_communities
 * (FK ON DELETE RESTRICT). Мягкое удаление безопасно.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireEducationPrivilege('manage_communities')
    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('communities')
      .select('id, is_active')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return NextResponse.json({ error: 'Община не найдена' }, { status: 404 })

    if (!current.is_active) {
      return NextResponse.json({ ok: true, already: true })
    }

    const { error } = await sb
      .from('communities')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ is_active: false } as any)
      .eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
