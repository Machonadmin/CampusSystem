import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageFinanceAccess } from '@/lib/finance/access'
import { isMissingTable } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'

/**
 * DELETE /api/finance/access/[id] — снять финансовый доступ (грант).
 * Право: canManageFinanceAccess. Деплой-безопасно (нет таблицы → ok).
 */
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageFinanceAccess(session))) return apiError('forbidden', 403)

    const sb = createServerClient()
    const { error } = await (sb)
      .from('finance_access_grants').delete().eq('id', params.id)
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ ok: true })
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
