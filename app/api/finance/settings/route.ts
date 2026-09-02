import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { hasFinancePrivilege } from '@/lib/finance/permissions'
import { parseBody, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'

/**
 * Настройки финансов (spec §3.9): редактируемые дефолты платы за обучение
 * (520000₽/год = 260000₽/семестр) + валюта + дефолтный % скидки. Значения —
 * ПРЕДЛОЖЕНИЕ, полностью редактируемое (spec §0.3), ничего не захардкожено.
 *
 * GET — прочитать (любой финансовый просмотр, включая view_student_balance).
 * PUT — изменить (manage_budget). Deploy-safe: нет таблицы → дефолты из спека.
 */

const DEFAULTS = { default_year_tuition: 520000, default_semester_tuition: 260000, currency: 'RUB', default_discount_percent: 90 }

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const allowed = (await hasFinancePrivilege(session, 'view'))
      || (await hasFinancePrivilege(session, 'view_student_balance'))
      || (await hasFinancePrivilege(session, 'manage_budget'))
    if (!allowed) return apiError('forbidden', 403)

    const sb = createServerClient()
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (sb.from('finance_settings') as any)
        .select('default_year_tuition, default_semester_tuition, currency, default_discount_percent').eq('id', true).maybeSingle()
      if (error) throw error
      return NextResponse.json({ settings: data ?? DEFAULTS })
    } catch (e) {
      if ((e as { code?: string }).code === '42P01') return NextResponse.json({ settings: DEFAULTS })
      throw e
    }
  } catch (err: unknown) {
    return jsonError(err)
  }
}

const putSchema = z.object({
  default_year_tuition: z.number().min(0).max(1e9).optional(),
  default_semester_tuition: z.number().min(0).max(1e9).optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  default_discount_percent: z.number().min(0).max(100).optional(),
})

export async function PUT(request: NextRequest) {
  try {
    const body = await parseBody(request, putSchema)
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!(await hasFinancePrivilege(session, 'manage_budget'))) return apiError('forbidden', 403)

    const patch: Record<string, unknown> = {}
    for (const k of ['default_year_tuition', 'default_semester_tuition', 'currency', 'default_discount_percent'] as const) {
      if (body[k] !== undefined) patch[k] = body[k]
    }
    if (Object.keys(patch).length === 0) return apiError('no_fields_to_update', 400)

    const sb = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.from('finance_settings') as any).upsert({ id: true, ...patch }, { onConflict: 'id' })
    if (error) {
      if (error.code === '42P01') return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
