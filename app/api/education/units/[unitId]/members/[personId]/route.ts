import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageUnit } from '@/lib/education/unit-access'

/**
 * DELETE /api/education/units/[unitId]/members/[personId]
 * Убрать члена из единицы — закрываем его активную позицию (end_date=сегодня)
 * и снимаем персональные education-права. Роль/аккаунт не трогаем.
 *
 * Право: superadmin или глава единицы. Главу единицы удалить нельзя.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { unitId: string; personId: string } }) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageUnit(session, params.unitId))) return apiError('forbidden', 403)

    const sb = createServerClient()
    const today = new Date().toISOString().slice(0, 10)

    // Нельзя убрать главу единицы через эту панель.
    const { data: positions } = await sb.from('staff_positions')
      .select('id, is_head, end_date').eq('person_id', params.personId).eq('department_id', params.unitId)
    const activeHead = (positions ?? []).some(p => (p as { is_head: boolean; end_date: string | null }).is_head && ((p as { end_date: string | null }).end_date === null))
    if (activeHead) return apiError('cannot_remove_head', 400)

    const { error } = await sb.from('staff_positions')
      .update({ end_date: today })
      .eq('person_id', params.personId).eq('department_id', params.unitId).is('end_date', null)
    if (error) throw error

    // Снять персональные education-права в этой единице.
    await sb.from('person_privileges').delete().eq('person_id', params.personId).eq('module', 'education')

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
