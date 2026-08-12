import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageJourneyDocs } from '@/lib/documents/journey-access'
import { hasDocumentsPrivilege } from '@/lib/documents/permissions'
import { mapDbError } from '@/lib/documents/http'
import { isReviewStatus } from '@/lib/documents/validation'

/**
 * PATCH /api/documents/[id]/review — статус проверки документа (בדיקת מסמך).
 * Body: { review_status: 'received' | 'checked' | 'rejected' }.
 *
 * Отдельный эндпоинт (а не общий PATCH), чтобы запись новых колонок была
 * deploy-safe: до применения миграции 20260724150000 колонок нет → 503
 * feature_not_migrated, а не 500. Право: как у DELETE — education-доступ на
 * journey ЛИБО привилегия «Документы» (manage).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)

    const body = await request.json().catch(() => ({})) as { review_status?: string }
    if (!isReviewStatus(body.review_status)) return apiError('invalid_reference', 400)

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('document_records')
      .select('id, journey_id')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return apiError('document_not_found', 404)

    const journeyId = (existing as { journey_id: string | null }).journey_id
    const ok = journeyId
      ? await canManageJourneyDocs(session, sb, journeyId)
      : await hasDocumentsPrivilege(session, 'manage')
    if (!ok) return apiError('forbidden', 403)

    try {
      const { error } = await sb
        .from('document_records')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          review_status: body.review_status,
          reviewed_by: session.person_id,
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq('id', params.id)
      if (error) {
        if ((error as { code?: string }).code === '42703') return apiError('feature_not_migrated', 503)
        const m = mapDbError(error)
        return NextResponse.json({ error: m.message }, { status: m.status })
      }
    } catch (e) {
      if ((e as { code?: string }).code === '42703') return apiError('feature_not_migrated', 503)
      throw e
    }

    return NextResponse.json({ ok: true, review_status: body.review_status })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
