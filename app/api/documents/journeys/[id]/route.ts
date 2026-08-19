import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireDocumentsPrivilege } from '@/lib/documents/permissions'
import { getSession } from '@/lib/auth/session'
import { canViewJourneyDocs } from '@/lib/documents/journey-access'
import { mapDbError } from '@/lib/documents/http'
import { isIsoDate, isDocType } from '@/lib/documents/validation'
import type { DocumentRecordInsert } from '@/types/database'

/**
 * GET  /api/documents/journeys/[id] — документы студента (свежие сверху). [id] =
 *   journey_id. Право: documents.view.
 * POST /api/documents/journeys/[id] — добавить документ (manage): doc_type,
 *   title (обяз.), issued_date?, expiry_date?, file_url?, notes. Аудит-колонка
 *   created_by заполняется из сессии; статус нового документа — 'active'.
 */

const DOC_COLS =
  'id, journey_id, doc_type, title, issued_date, expiry_date, file_url, storage_path, file_name, mime_type, size_bytes, status, notes, created_by, created_at, updated_at'

const PAGE = 1000

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })

    const sb = createServerClient()

    // Доступ: привилегия «Документы» ЛИБО education-авторизация на journey.
    const ok = await canViewJourneyDocs(session, sb, params.id)
    if (!ok) throw Object.assign(new Error(serverT('forbidden')), { status: 403 })

    // Постранично, как остальные выборки списков модуля (устойчиво к db-max-rows
    // PostgREST, который молча обрезает большие ответы).
    const documents: unknown[] = []
    let offset = 0
    for (;;) {
      const { data, error } = await sb
        .from('document_records')
        .select(DOC_COLS)
        .eq('journey_id', params.id)
        .order('expiry_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      const batch = data ?? []
      documents.push(...batch)
      if (batch.length < PAGE) break
      offset += PAGE
    }

    return NextResponse.json({ documents })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireDocumentsPrivilege('manage')

    const body = await request.json() as {
      doc_type?: string
      title?: string
      issued_date?: string | null
      expiry_date?: string | null
      file_url?: string | null
      notes?: string | null
    }

    const title = body.title?.trim()
    if (!title) {
      return apiError('title_field_required', 400)
    }

    // doc_type: не задан → 'other'; задан → должен быть допустимым.
    let docType: DocumentRecordInsert['doc_type'] = 'other'
    if (body.doc_type !== undefined && body.doc_type !== null && body.doc_type !== '') {
      if (!isDocType(body.doc_type)) {
        return apiError('invalid_document_type', 400)
      }
      docType = body.doc_type
    }

    let issued: string | null = null
    if (body.issued_date !== undefined && body.issued_date !== null && body.issued_date !== '') {
      issued = body.issued_date.trim()
      if (!isIsoDate(issued)) {
        return apiError('issued_date_must_be_date', 400)
      }
    }

    let expiry: string | null = null
    if (body.expiry_date !== undefined && body.expiry_date !== null && body.expiry_date !== '') {
      expiry = body.expiry_date.trim()
      if (!isIsoDate(expiry)) {
        return apiError('expiry_date_must_be_date', 400)
      }
    }

    const sb = createServerClient()

    const { data: journey, error: jErr } = await sb
      .from('education_journeys').select('id').eq('id', params.id).maybeSingle()
    if (jErr) throw jErr
    if (!journey) return apiError('student_not_found', 400)

    const insert: DocumentRecordInsert = {
      journey_id: params.id,
      doc_type: docType,
      title,
      issued_date: issued,
      expiry_date: expiry,
      file_url: body.file_url?.trim() || null,
      notes: body.notes?.trim() || null,
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
