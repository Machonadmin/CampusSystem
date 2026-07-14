import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireJewishnessAccess } from '@/lib/jewishness/permissions'
import { uploadDocument, isAllowedMime, MAX_UPLOAD_BYTES } from '@/lib/documents/storage'
import { isDocType } from '@/lib/documents/validation'
import { notifyOwnerOfDocument } from '@/lib/notifications/journey-owner'
import type { DocumentRecordInsert } from '@/types/database'

/**
 * POST /api/jewishness/queue/[journeyId]/document — загрузка документа
 * абитуриентки, находящейся на активном этапе jewishness (реальный файл в
 * приватный бакет + строка document_records). Ответственный за яхадут не имеет
 * прав модуля «Документы», поэтому грузит через этот эндпоинт; доступ ограничен
 * jewishness.access + IDOR-гейтом (у journey должен быть активный этап
 * jewishness). Поля формы: file (обяз.), title (обяз.), doc_type? (по умолчанию
 * 'certificate').
 */

export const runtime = 'nodejs'

const DOC_COLS =
  'id, journey_id, doc_type, title, file_url, storage_path, file_name, mime_type, size_bytes, status, created_at'

function formStr(form: FormData, key: string): string | null {
  const v = form.get(key)
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/** У journey есть АКТИВНЫЙ этап jewishness? Защита от загрузки чужим людям. */
async function journeyOnActiveJewishness(sb: ReturnType<typeof createServerClient>, journeyId: string): Promise<boolean> {
  const { data } = await sb
    .from('stage_instances')
    .select('id, stage_template:stage_templates!inner(code), process_instance:process_instances!inner(journey_id)')
    .eq('stage_template.code', 'jewishness')
    .eq('process_instance.journey_id', journeyId)
    .eq('status', 'active')
    .limit(1)
  return !!data && data.length > 0
}

export async function POST(
  request: NextRequest,
  { params }: { params: { journeyId: string } }
) {
  try {
    const session = await requireJewishnessAccess()

    const sb = createServerClient()
    if (!(await journeyOnActiveJewishness(sb, params.journeyId))) {
      return apiError('forbidden', 403)
    }

    const form = await request.formData()

    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) return apiError('file_required', 400)
    if (file.size > MAX_UPLOAD_BYTES) return apiError('file_too_large', 400)
    if (!isAllowedMime(file.type)) return apiError('file_type_not_allowed', 400)

    const title = formStr(form, 'title')
    if (!title) return apiError('title_field_required', 400)

    let docType: DocumentRecordInsert['doc_type'] = 'certificate'
    const rawType = formStr(form, 'doc_type')
    if (rawType) {
      if (!isDocType(rawType)) return apiError('invalid_document_type', 400)
      docType = rawType
    }

    const uploaded = await uploadDocument(params.journeyId, file)

    const insert: DocumentRecordInsert = {
      journey_id: params.journeyId,
      doc_type: docType,
      title,
      file_url: null,
      storage_path: uploaded.storage_path,
      file_name: uploaded.file_name,
      mime_type: uploaded.mime_type,
      size_bytes: uploaded.size_bytes,
      status: 'active',
      created_by: session.person_id,
    }

    const { data: rec, error } = await sb
      .from('document_records')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(insert as any)
      .select(DOC_COLS)
      .single()
    if (error) throw error

    await notifyOwnerOfDocument(sb, params.journeyId, session.person_id)

    return NextResponse.json({ document: rec }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
