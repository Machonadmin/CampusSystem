import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireJewishnessAccess } from '@/lib/jewishness/permissions'
import { isJewishnessStatus, setJewishnessStatus } from '@/lib/jewishness/status'

/**
 * POST /api/jewishness/journeys/[journeyId]/status
 * Установить статус проверки еврейства (модульный путь).
 * Body: { status: 'pending'|'verified'|'rejected'|'needs_review', note?: string }
 *
 * Пишет статус + строку истории (source='module'). Это одна из двух точек
 * записи статуса (вторая — завершение acceptance-этапа 'jewishness'); обе пишут
 * одно и то же поле, поэтому статус остаётся согласованным. Формальное
 * подписанное решение по этапу приёма по-прежнему делается в потоке подписи.
 *
 * Право: jewishness.access (superadmin — в обход).
 */
export async function POST(request: NextRequest, { params }: { params: { journeyId: string } }) {
  try {
    const session = await requireJewishnessAccess()

    const body = await request.json().catch(() => ({})) as { status?: string; note?: string }
    if (!isJewishnessStatus(body.status)) return apiError('invalid_reference', 400)

    const sb = createServerClient()

    // journey должен существовать.
    const { data: journey, error: jErr } = await sb
      .from('education_journeys').select('id').eq('id', params.journeyId).maybeSingle()
    if (jErr) throw jErr
    if (!journey) return apiError('journey_not_found', 404)

    const ok = await setJewishnessStatus(sb, {
      journeyId: params.journeyId,
      status: body.status,
      changedBy: session.person_id,
      note: body.note ?? null,
      source: 'module',
    })
    if (!ok) return apiError('feature_not_migrated', 503)

    return NextResponse.json({ ok: true, status: body.status })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
