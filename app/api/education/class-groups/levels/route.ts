import { NextResponse } from 'next/server'
import { serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasEducationPrivilege } from '@/lib/education/permissions'

/**
 * GET /api/education/class-groups/levels — уже используемые значения «уровня»
 * учебных групп (distinct, непустые). Чтобы при создании/редактировании группы
 * выбирать из существующих (datalist) и не плодить варианты (решение владельца
 * «א» 2026-07-16: оставляем как есть, дальше — выбираем из списка). Только чтение.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: serverT('unauthorized') }, { status: 401 })
    const allowed = session.roles.includes('superadmin') || await hasEducationPrivilege(session, 'view_students')
    if (!allowed) return NextResponse.json({ error: serverT('forbidden') }, { status: 403 })

    const sb = createServerClient()
    const { data, error } = await sb.from('class_groups').select('level').not('level', 'is', null)
    if (error) {
      if ((error as { code?: string }).code === '42P01') return NextResponse.json({ levels: [] })
      throw error
    }
    const levels = [...new Set(((data ?? []) as Array<{ level: string | null }>)
      .map(r => (r.level ?? '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ru'))
    return NextResponse.json({ levels })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
