import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import type { PositionCategory, ReferencePositionUpdate } from '@/types/database'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

function isAdmin(session: Awaited<ReturnType<typeof requireAuth>>) {
  const roles = session.roles ?? []
  return roles.includes('superadmin') || roles.includes('admin') || roles.includes('hr_director')
}

const VALID_CATEGORIES: PositionCategory[] = ['academic', 'administrative', 'support']

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth()
    const sb = createServerClient()
    const { data, error } = await sb
      .from('reference_positions')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()
    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Должность не найдена' }, { status: 404 })
    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

/**
 * PATCH /api/settings/positions/[id]
 * Право: superadmin / admin / hr_director
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
    }

    const sb = createServerClient()
    const body = await request.json() as {
      name_ru?: string
      name_he?: string | null
      category?: string
      is_teaching?: boolean
      is_active?: boolean
      sort_order?: number
    }

    const { data: current, error: fetchErr } = await sb
      .from('reference_positions')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return NextResponse.json({ error: 'Должность не найдена' }, { status: 404 })

    const update: ReferencePositionUpdate = {}
    if (body.name_ru !== undefined) {
      const n = body.name_ru.trim()
      if (!n) return NextResponse.json({ error: 'Название не может быть пустым' }, { status: 400 })
      update.name_ru = n
    }
    if (body.name_he !== undefined) update.name_he = body.name_he?.trim() || null
    if (body.category !== undefined) {
      if (!VALID_CATEGORIES.includes(body.category as PositionCategory)) {
        return NextResponse.json(
          { error: 'category должен быть одним из: academic, administrative, support' },
          { status: 400 }
        )
      }
      update.category = body.category as PositionCategory
    }
    if (body.is_teaching !== undefined) update.is_teaching = body.is_teaching
    if (body.is_active   !== undefined) update.is_active   = body.is_active
    if (body.sort_order  !== undefined) update.sort_order  = body.sort_order

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    const { data, error } = await sb
      .from('reference_positions')
      .update(update)
      .eq('id', params.id)
      .select('*')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Должность с таким названием уже существует' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

/**
 * DELETE /api/settings/positions/[id]
 * Мягкое удаление (is_active = false).
 * Право: superadmin / admin / hr_director
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
    }

    const sb = createServerClient()

    const { data: current, error: fetchErr } = await sb
      .from('reference_positions')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchErr) throw fetchErr
    if (!current) return NextResponse.json({ error: 'Должность не найдена' }, { status: 404 })

    const { data, error } = await sb
      .from('reference_positions')
      .update({ is_active: false })
      .eq('id', params.id)
      .select('*')
      .single()
    if (error) throw error

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
