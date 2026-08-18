import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { requireEducationPrivilege, canDoEducationInAny } from '@/lib/education/permissions'
import { getRolloverSettings, runYearRollover } from '@/lib/education/year-rollover'

/**
 * GET  /api/education/year-rollover — текущие настройки перехода года.
 * POST /api/education/year-rollover — { action }:
 *   • 'auto'  — тихий авто-переход (вызывается при загрузке дашборда учёбы;
 *               идемпотентно, один раз в год после даты). Право: view.
 *   • 'run'   — ручной запуск сейчас. Право: manage_students.
 *   • 'save'  — сохранить дату/вкл-выкл. Право: manage_students.
 *
 * Всё деплой-безопасно: до применения миграции возвращаем мягкий ответ.
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const allowed =
      (await canDoEducationInAny(session, 'manage_students')) ||
      (await canDoEducationInAny(session, 'view_students'))
    if (!allowed) return apiError('forbidden', 403)

    const sb = createServerClient()
    const settings = await getRolloverSettings(sb)
    return NextResponse.json({ settings })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as {
      action?: 'auto' | 'run' | 'save'
      rollover_month?: number
      rollover_day?: number
      auto_enabled?: boolean
    }
    const action = body.action ?? 'auto'
    const sb = createServerClient()

    // ── Тихий авто-переход при заходе на дашборд ──
    if (action === 'auto') {
      const session = await getSession()
      if (!session) return apiError('unauthorized', 401)
      const allowed =
        (await canDoEducationInAny(session, 'manage_students')) ||
        (await canDoEducationInAny(session, 'view_students'))
      if (!allowed) return apiError('forbidden', 403)
      try {
        const result = await runYearRollover(sb, { manual: false })
        return NextResponse.json(result)
      } catch {
        // Миграция ещё не применена и т.п. — не роняем дашборд.
        return NextResponse.json({ ran: false, promoted: 0, graduated: 0 })
      }
    }

    // ── Ручной запуск / сохранение настроек — только manage ──
    await requireEducationPrivilege('manage_students')

    if (action === 'run') {
      const result = await runYearRollover(sb, { manual: true })
      return NextResponse.json(result)
    }

    if (action === 'save') {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (typeof body.rollover_month === 'number') {
        if (body.rollover_month < 1 || body.rollover_month > 12) return apiError('invalid_input', 400)
        patch.rollover_month = body.rollover_month
      }
      if (typeof body.rollover_day === 'number') {
        if (body.rollover_day < 1 || body.rollover_day > 31) return apiError('invalid_input', 400)
        patch.rollover_day = body.rollover_day
      }
      if (typeof body.auto_enabled === 'boolean') patch.auto_enabled = body.auto_enabled

      // academic_year_settings нет в сгенерированных типах — untyped-клиент.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await ((sb as any).from('academic_year_settings').update(patch).eq('id', true))
      if (error) throw error
      const settings = await getRolloverSettings(sb)
      return NextResponse.json({ settings })
    }

    return apiError('invalid_input', 400)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
