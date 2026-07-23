import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { hasDocumentsPrivilege } from '@/lib/documents/permissions'
import { getSession } from '@/lib/auth/session'
import { canViewJourneyDocs } from '@/lib/documents/journey-access'
import { mapDbError } from '@/lib/documents/http'
import { getSignedUrl } from '@/lib/documents/storage'

/**
 * GET /api/documents/[id]/signed-url — свежая ссылка на файл документа.
 * Если запись хранит storage_path — генерируется подписанная ссылка (5 мин);
 * иначе отдаётся внешний file_url. Право: documents.view. Сырой путь и ключ
 * наружу не отдаются.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })

    const sb = createServerClient()
    const { data: rec, error } = await sb
      .from('document_records')
      .select('id, storage_path, file_url, journey_id')
      .eq('id', params.id)
      .maybeSingle()
    if (error) throw error
    if (!rec) return apiError('record_not_found', 404)

    // journey-привязанный документ: education ЛИБО «Документы». Без journey —
    // прежнее поведение (только привилегия модуля «Документы»).
    const journeyId = (rec as { journey_id: string | null }).journey_id
    const ok = journeyId
      ? await canViewJourneyDocs(session, sb, journeyId)
      : await hasDocumentsPrivilege(session, 'view')
    if (!ok) throw Object.assign(new Error(serverT('forbidden')), { status: 403 })

    if (rec.storage_path) {
      const url = await getSignedUrl(rec.storage_path)
      return NextResponse.json({ url })
    }
    if (rec.file_url) {
      return NextResponse.json({ url: rec.file_url })
    }
    return apiError('record_not_found', 404)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
