import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serverT, apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageFinanceAccess } from '@/lib/finance/access'

/**
 * DELETE /api/finance/access/[id] — снять финансовый доступ (грант).
 * Право: canManageFinanceAccess. Деплой-безопасно (нет таблицы → ok).
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageFinanceAccess(session))) return apiError('forbidden', 403)

    const sb = createServerClient()
    const { error } = await (sb as unknown as SupabaseClient)
      .from('finance_access_grants').delete().eq('id', params.id)
    if (error) {
      if ((error as { code?: string }).code === '42P01') return NextResponse.json({ ok: true })
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
