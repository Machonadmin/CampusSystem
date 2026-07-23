import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { canManageJourneyDocs } from '@/lib/documents/journey-access'
import { notifyOwnerOfDocument } from '@/lib/notifications/journey-owner'
import { mapDbError } from '@/lib/documents/http'
import { isDocType, isIsoDate } from '@/lib/documents/validation'
import { uploadDocument, isAllowedMime, MAX_UPLOAD_BYTES } from '@/lib/documents/storage'
import type { DocumentRecordInsert } from '@/types/database'

/**
 * POST /api/documents/journeys/[id]/upload — загрузка РЕАЛЬНОГО файла (multipart)
 * в приватный бакет Supabase Storage и создание строки document_records с
 * storage_path (file_url остаётся null). [id] = journey_id. Право: documents.manage.
 * Поля формы: file (обяз.), title (обяз.), doc_type?, issued_date?, expiry_date?, notes?.
 */

export const runtime = 'nodejs'

const DOC_COLS =
  'id, journey_id, doc_type, title, issued_date, expiry_date, file_url, storage_path, file_name, mime_type, size_bytes, status, notes, created_by, created_at, updated_at'

function formStr(form: FormData, key: string): string | null {
  const v = form.get(key)
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })

    const sb = createServerClient()

    // Доступ: привилегия «Документы» ЛИБО education-авторизация на journey.
    const canManage = await canManageJourneyDocs(session, sb, params.id)
    if (!canManage) throw Object.assign(new Error(serverT('forbidden')), { status: 403 })

    const form = await request.formData()

    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) return apiError('file_required', 400)
    if (file.size > MAX_UPLOAD_BYTES) return apiError('file_too_large', 400)
    if (!isAllowedMime(file.type)) return apiError('file_type_not_allowed', 400)

    const title = formStr(form, 'title')
    if (!title) return apiError('title_field_required', 400)

    let docType: DocumentRecordInsert['doc_type'] = 'other'
    const rawType = formStr(form, 'doc_type')
    if (rawType) {
      if (!isDocType(rawType)) return apiError('invalid_document_type', 400)
      docType = rawType
    }

    let issued: string | null = null
    const rawIssued = formStr(form, 'issued_date')
    if (rawIssued) {
      if (!isIsoDate(rawIssued)) return apiError('issued_date_must_be_date', 400)
      issued = rawIssued
    }

    let expiry: string | null = null
    const rawExpiry = formStr(form, 'expiry_date')
    if (rawExpiry) {
      if (!isIsoDate(rawExpiry)) return apiError('expiry_date_must_be_date', 400)
      expiry = rawExpiry
    }

    const notes = formStr(form, 'notes')

    const { data: journey, error: jErr } = await sb
      .from('education_journeys').select('id').eq('id', params.id).maybeSingle()
    if (jErr) throw jErr
    if (!journey) return apiError('student_not_found', 400)

    // Загружаем в хранилище, затем пишем строку с метаданными файла.
    const uploaded = await uploadDocument(params.id, file)

    const insert: DocumentRecordInsert = {
      journey_id: params.id,
      doc_type: docType,
      title,
      issued_date: issued,
      expiry_date: expiry,
      file_url: null,
      storage_path: uploaded.storage_path,
      file_name: uploaded.file_name,
      mime_type: uploaded.mime_type,
      size_bytes: uploaded.size_bytes,
      notes,
      status: 'active',
      created_by: session.person_id,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('document_records')
      .insert(insert as any)
      .select(DOC_COLS)
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    await notifyOwnerOfDocument(sb, params.id, session.person_id)

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
