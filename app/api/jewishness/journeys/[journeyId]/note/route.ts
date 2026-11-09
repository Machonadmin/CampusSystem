import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireJewishnessAccess } from '@/lib/jewishness/permissions'
import { addJewishnessNote } from '@/lib/jewishness/status'
import { errorResponse } from '@/lib/api/handler'

/**
 * POST /api/jewishness/journeys/[journeyId]/note
 * Добавить заметку к проверке еврейства — в ЛЮБОМ статусе, в т.ч. после «אושר».
 * Body: { note: string }
 *
 * Решение владельца (2026-11-09): заметка ДОБАВЛЯЕТСЯ в историю (не заменяет
 * основную заметку в карточке), статус не меняется; добавлять может любой с
 * доступом к модулю; в каждой записи истории видно, кто её сделал (changed_by).
 *
 * Право: jewishness.access (superadmin — в обход).
 */
export async function POST(request: NextRequest, props: { params: Promise<{ journeyId: string }> }) {
  const params = await props.params
  try {
    const session = await requireJewishnessAccess()

    const body = await request.json().catch(() => ({})) as { note?: unknown }
    const note = typeof body.note === 'string' ? body.note.trim() : ''
    if (!note) return apiError('invalid_reference', 400)

    const sb = createServerClient()
    const ok = await addJewishnessNote(sb, {
      journeyId: params.journeyId,
      changedBy: session.person_id,
      note,
    })
    if (ok === 'not_found') return apiError('journey_not_found', 404)
    if (!ok) return apiError('feature_not_migrated', 503)

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return errorResponse(e)
  }
}
