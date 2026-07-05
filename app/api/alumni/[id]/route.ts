import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasAlumniPrivilege } from '@/lib/alumni/permissions'
import type { AlumniProfileUpdate } from '@/types/database'

/**
 * PATCH /api/alumni/[id]
 *
 * Обновление редактируемых пользователем полей профиля выпускника:
 *   current_location, current_occupation, notes
 * [id] — alumni_profiles.id.
 *
 * Право: alumni.manage.
 *
 * graduation_year/institution/direction НЕ редактируются здесь — они
 * наполняются автоматически RPC при выпуске (см. миграцию alumni_graduation).
 */

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: 'Неверный идентификатор' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const canManage = await hasAlumniPrivilege(session, 'manage')
    if (!canManage) {
      return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
    }

    const body = await request.json() as {
      current_location?: string | null
      current_occupation?: string | null
      notes?: string | null
    }

    // Собираем только разрешённые к редактированию поля.
    const update: AlumniProfileUpdate = {}
    if ('current_location' in body) update.current_location = body.current_location?.trim() || null
    if ('current_occupation' in body) update.current_occupation = body.current_occupation?.trim() || null
    if ('notes' in body) update.notes = body.notes?.trim() || null

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет полей для обновления' }, { status: 400 })
    }

    const sb = createServerClient()

    const { data: updated, error } = await sb
      .from('alumni_profiles')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(update as any)
      .eq('id', params.id)
      .select('id, person_id, graduation_year, institution, direction, current_location, current_occupation, notes')
      .maybeSingle()

    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    if (!updated) {
      return NextResponse.json({ error: 'Профиль выпускника не найден' }, { status: 404 })
    }

    return NextResponse.json(updated)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
