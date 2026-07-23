import { NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getHeadedUnitIds } from '@/lib/education/unit-access'
import { getCookieLocale } from '@/lib/i18n/locale'
import { localizedDeptName } from '@/lib/departments/localized-name'

/**
 * GET /api/education/units — учебные единицы, которыми пользователь вправе
 * управлять: superadmin видит все подразделения, иначе — те, где он глава
 * (staff_positions.is_head). Для панели «состав единицы».
 */
export async function GET() {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    const sb = createServerClient()

    const isSuper = session.roles.includes('superadmin')
    let unitIds: string[]
    if (isSuper) {
      const { data } = await sb.from('departments').select('id')
      unitIds = (data ?? []).map(d => (d as { id: string }).id)
    } else {
      unitIds = await getHeadedUnitIds(session.person_id)
    }
    if (unitIds.length === 0) return NextResponse.json({ units: [], is_super: isSuper })

    // Мультиязычные названия (RU по умолчанию). Деплой-безопасно: если колонок
    // name_he/name_en ещё нет (миграция не применена) — откат к базовому select.
    const lang = getCookieLocale()
    const primary = await sb.from('departments').select('id, name, name_he, name_en').in('id', unitIds)
    const data = primary.error
      ? (await sb.from('departments').select('id, name').in('id', unitIds)).data
      : primary.data
    const rows = (data ?? []) as unknown as Array<{ id: string; name: string; name_he?: string | null; name_en?: string | null }>
    const units = rows.map(d => ({ id: d.id, name: localizedDeptName(d, lang) }))
    units.sort((a, b) => a.name.localeCompare(b.name, lang === 'ru' ? 'ru' : 'he'))
    return NextResponse.json({ units, is_super: isSuper })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
