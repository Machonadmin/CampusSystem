import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'

/**
 * GET /api/education/study-tracks — справочник маршрутов второй половины дня.
 * Право: view_students (или superadmin). Защищено к отсутствию таблицы (42P01
 * → пустой список), поэтому деплой до миграции безопасен.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })
    const allowed = session.roles.includes('superadmin') || await hasEducationPrivilege(session, 'view_students')
    if (!allowed) return NextResponse.json({ error: serverT('forbidden') }, { status: 403 })

    const sb = createServerClient()
    const { data, error } = await sb
      .from('study_tracks')
      .select('id, code, name_he, name_ru, name_en, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) {
      if (error.code === '42P01') return NextResponse.json({ tracks: [] })
      throw error
    }
    return NextResponse.json({ tracks: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
