import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { getSignedUrl } from '@/lib/documents/storage'

/**
 * GET /api/psychologist/referrals/document/[id] — подписанная ссылка на документ
 * абитуриентки ИЗ очереди направлений психолога.
 *
 * Психолог не имеет прав модуля «Документы», поэтому обычный /api/documents/... ему
 * закрыт. Здесь доступ ограничен строго: подписант medical_psych-этапа
 * (psychologist/superadmin) может открыть документ ТОЛЬКО если его journey прямо
 * сейчас находится на активном этапе `medical_psych` (т.е. реально направлена
 * к психологу). Это защищает от чтения произвольных документов (IDOR).
 */

const PSYCH_SIGNER_ROLES = ['psychologist', 'superadmin']

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (!PSYCH_SIGNER_ROLES.some(r => session.roles.includes(r))) {
      return apiError('forbidden', 403)
    }

    const sb = createServerClient()

    const { data: rec, error } = await sb
      .from('document_records')
      .select('id, journey_id, storage_path, file_url')
      .eq('id', params.id)
      .maybeSingle()
    if (error) throw error
    if (!rec) return apiError('record_not_found', 404)

    // IDOR-гейт: у journey документа должен быть АКТИВНЫЙ этап medical_psych.
    const { data: activePsych } = await sb
      .from('stage_instances')
      .select('id, stage_template:stage_templates!inner(code), process_instance:process_instances!inner(journey_id)')
      .eq('stage_template.code', 'medical_psych')
      .eq('process_instance.journey_id', rec.journey_id)
      .eq('status', 'active')
      .limit(1)
    if (!activePsych || activePsych.length === 0) {
      return apiError('forbidden', 403)
    }

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
