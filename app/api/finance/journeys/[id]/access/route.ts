import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canViewStudentFinance, canManageStudentFinance, canManageFinanceAccess } from '@/lib/finance/access'

/**
 * Финансовый доступ к КОНКРЕТНОЙ студентке (для панели в карточке).
 *   GET  → { can_view, can_manage, can_manage_access, portal_visible }.
 *   POST { portal_visible } → менеджер разрешает/скрывает финансы студентке в
 *          портале (education_journeys.student_finance_visible).
 * Деплой-безопасно к отсутствию колонки (42703).
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const [canView, canManage, canManageAccess] = await Promise.all([
      canViewStudentFinance(session, params.id),
      canManageStudentFinance(session, params.id),
      canManageFinanceAccess(session),
    ])

    let portalVisible = false
    try {
      const sb = createServerClient()
      const { data, error } = await (sb as unknown as SupabaseClient)
        .from('education_journeys').select('student_finance_visible').eq('id', params.id).maybeSingle()
      if (error) throw error
      portalVisible = !!(data as { student_finance_visible?: boolean } | null)?.student_finance_visible
    } catch (e) {
      if ((e as { code?: string }).code !== '42703') throw e
    }

    return NextResponse.json({ can_view: canView, can_manage: canManage, can_manage_access: canManageAccess, portal_visible: portalVisible })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageFinanceAccess(session))) return apiError('forbidden', 403)

    const body = await request.json().catch(() => ({})) as { portal_visible?: boolean }
    const visible = !!body.portal_visible

    const sb = createServerClient()
    const { error } = await (sb as unknown as SupabaseClient)
      .from('education_journeys').update({ student_finance_visible: visible }).eq('id', params.id)
    if (error) {
      if ((error as { code?: string }).code === '42703') return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ ok: true, portal_visible: visible })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
