import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * GET /api/education/levels?direction_id={uuid}
 * Уровни (курсы/классы) направления.
 *
 * Право: любой авторизованный пользователь.
 * Ответ: [{ id, name_ru, sort_order }] — только is_active=true, по sort_order.
 *   - direction не существует → 404
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const directionId = request.nextUrl.searchParams.get('direction_id')
    if (!directionId) {
      return NextResponse.json({ error: 'direction_id обязателен' }, { status: 400 })
    }

    const sb = createServerClient()

    const { data: direction, error: dirErr } = await sb
      .from('reference_directions')
      .select('id')
      .eq('id', directionId)
      .maybeSingle()
    if (dirErr) throw dirErr
    if (!direction) return NextResponse.json({ error: 'Направление не найдено' }, { status: 404 })

    const { data, error } = await sb
      .from('reference_levels')
      .select('id, name_ru, sort_order')
      .eq('direction_id', directionId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) throw error

    return NextResponse.json({ levels: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
