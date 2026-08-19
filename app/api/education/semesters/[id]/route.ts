import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getEducationPrivilegeScope } from '@/lib/education/permissions'

/**
 * PATCH /api/education/semesters/[id] — переименовать / открыть-закрыть семестр
 * (учебное действие). ЦЕНУ здесь НЕ меняем — это финансы. Право: manage_class_groups
 * или superadmin. Деплой-безопасно (42P01).
 */
function sem(sb: ReturnType<typeof createServerClient>) {
  return (sb as unknown as SupabaseClient).from('semesters')
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    // Институтский объект → только scope='all' или superadmin (см. route.ts).
    const allowed = session.roles.includes('superadmin')
      || (await getEducationPrivilegeScope(session, 'manage_class_groups')) === 'all'
    if (!allowed) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { name?: string; status?: string }
    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) patch.name = (body.name ?? '').trim() || null
    if (body.status !== undefined) {
      if (!['open', 'closed'].includes(body.status)) return apiError('invalid_reference', 400)
      patch.status = body.status
    }
    if (Object.keys(patch).length === 0) return apiError('invalid_reference', 400)

    const sb = createServerClient()
    const { data, error } = await sem(sb)
      .update(patch).eq('id', params.id)
      .select('id, year_label, term_number, name, status, created_at')
      .single()
    if (error) {
      if ((error as { code?: string }).code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ semester: data })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
