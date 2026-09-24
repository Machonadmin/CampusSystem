import { NextRequest } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { getSession } from '@/lib/auth/session'
import { canManageUnit } from '@/lib/education/unit-access'
import { errorResponse } from '@/lib/api/handler'

/**
 * PUT /api/education/units/[unitId]/members/[personId]/privileges — БЫВШИЕ
 * личные тумблеры члена единицы от руководителя.
 *
 * Решение владельца: права редактируются ТОЛЬКО в «אבטחת מידע» (руководитель
 * подразделения — через свой урезанный вид там). Ни один экран этот маршрут
 * больше не вызывает; отвечаем 410 Gone (как /api/settings/person-privileges),
 * сохранив прежние проверки доступа.
 */
export async function PUT(
  _request: NextRequest,
  props: { params: Promise<{ unitId: string; personId: string }> }
) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await canManageUnit(session, params.unitId))) return apiError('forbidden', 403)
    return apiError('person_privileges_moved', 410, { redirect_to: '/dashboard/data-security' })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
