import { NextRequest, NextResponse } from 'next/server'
import { requireStaff, jsonError } from '@/lib/api/handler'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { isMissingTable } from '@/lib/supabase/errors'
import { sanitizeUiPrefs } from '@/lib/prefs/ui-prefs'

/**
 * Личная раскладка интерфейса ТЕКУЩЕГО сотрудника (self-scoped: person_id
 * только из сессии, никогда из запроса — чужую раскладку не прочитать и не
 * записать).
 *
 * GET — { prefs, persisted }. persisted=false — таблицы ещё нет (миграция
 *       20260923220000 не запущена): отдаём раскладку по умолчанию, экран
 *       работает как раньше.
 * PUT — сохранить раскладку целиком. Тело приводится sanitizeUiPrefs к
 *       допустимому виду (мусор отбрасывается). До миграции — 503
 *       feature_not_migrated.
 *
 * Права здесь не проверяются и не выдаются: раскладка только скрывает и
 * переставляет то, что сервер и так разрешил (см. lib/prefs/ui-prefs.ts).
 * Режим «צפייה כמשתמש» (только чтение) блокирует PUT в middleware.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await requireStaff()
    const sb = createServerClient()
    const { data, error } = await sb
      .from('user_preferences')
      .select('prefs')
      .eq('person_id', session.person_id)
      .maybeSingle()
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ prefs: sanitizeUiPrefs(null), persisted: false })
      throw error
    }
    return NextResponse.json({ prefs: sanitizeUiPrefs(data?.prefs ?? null), persisted: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireStaff()
    const body = await request.json().catch(() => null) as { prefs?: unknown } | null
    if (!body || typeof body !== 'object' || !body.prefs || typeof body.prefs !== 'object') {
      return apiError('invalid_input', 400)
    }
    const prefs = sanitizeUiPrefs(body.prefs)

    const sb = createServerClient()
    const { error } = await sb
      .from('user_preferences')
      .upsert({ person_id: session.person_id, prefs, updated_at: new Date().toISOString() }, { onConflict: 'person_id' })
    if (error) {
      if (isMissingTable(error)) return apiError('feature_not_migrated', 503)
      throw error
    }
    return NextResponse.json({ prefs, persisted: true })
  } catch (err: unknown) {
    return jsonError(err)
  }
}
