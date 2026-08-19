import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireJewishnessAccess } from '@/lib/jewishness/permissions'
import { getSignedUrl } from '@/lib/documents/storage'

/**
 * GET /api/jewishness/queue/document/[id] — подписанная ссылка на документ
 * абитуриентки ИЗ очереди бирур-яхадут. Доступ: jewishness.access + IDOR-гейт
 * (journey документа должен быть на активном этапе jewishness).
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireJewishnessAccess()
    const sb = createServerClient()

    const { data: rec, error } = await sb
      .from('document_records')
      .select('id, journey_id, storage_path, file_url')
      .eq('id', params.id)
      .maybeSingle()
    if (error) throw error
    if (!rec) return apiError('record_not_found', 404)

    const { data: active } = await sb
      .from('stage_instances')
      .select('id, stage_template:stage_templates!inner(code), process_instance:process_instances!inner(journey_id)')
      .eq('stage_template.code', 'jewishness')
      .eq('process_instance.journey_id', rec.journey_id)
      .eq('status', 'active')
      .limit(1)
    if (!active || active.length === 0) return apiError('forbidden', 403)

    if (rec.storage_path) {
      const url = await getSignedUrl(rec.storage_path)
      return NextResponse.json({ url })
    }
    if (rec.file_url) {
      return NextResponse.json({ url: rec.file_url })
    }
    return apiError('record_not_found', 404)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
