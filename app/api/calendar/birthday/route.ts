import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { mapDbError } from '@/lib/calendar/http'

/**
 * ЛИЧНЫЙ календарь — моя дата рождения. ТОЛЬКО чтение.
 *
 * GET /api/calendar/birthday → { birth_date: 'YYYY-MM-DD' | null }
 *   — единственная строка persons, где id = session.person_id, поле birth_date
 *     (записано при регистрации). Self-scoped ровно как остальной календарь:
 *     чужую дату рождения НЕ отдаём. Пагинация не нужна — одна строка. Если
 *     birth_date не задана (nullable) — отдаём null, это не ошибка.
 *
 * Дата рождения на календаре read-only: клиент разворачивает её в ежегодный
 * «день рождения» (birthdayInstances) и показывает нередактируемым чипом.
 */

export async function GET() {
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()

    const { data, error } = await sb
      .from('persons')
      .select('birth_date')
      .eq('id', session.person_id)
      .single()
    if (error) throw error

    return NextResponse.json({ birth_date: data?.birth_date ?? null })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
