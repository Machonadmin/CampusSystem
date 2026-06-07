import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

/**
 * GET /api/education/institutions
 * Список учебных заведений (departments с is_educational_institution=true).
 *
 * Право: любой авторизованный пользователь.
 * Ответ: [{ id, name }] — отсортировано по name.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const sb = createServerClient()

    const { data, error } = await sb
      .from('departments')
      .select('id, name')
      .eq('is_educational_institution', true)
      .order('name', { ascending: true })
    if (error) throw error

    return NextResponse.json({ institutions: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
