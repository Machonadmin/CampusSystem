import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireDocumentsPrivilege } from '@/lib/documents/permissions'
import { mapDbError } from '@/lib/documents/http'
import { isIsoDate, isDocType, isDocStatus } from '@/lib/documents/validation'
import type { DocumentRecordUpdate } from '@/types/database'

/**
 * GET    /api/documents/[id] — документ по id (view).
 * PATCH  /api/documents/[id] — правка документа (manage): тип, название, даты
 *   выдачи/окончания (null/'' → очистить), ссылка на файл, заметки, статус
 *   (active/archived — «архивировать»/«вернуть» через isDocStatus).
 * DELETE /api/documents/[id] — жёсткое удаление (manage). Мягкое архивирование
 *   делается через PATCH status='archived'.
 */

const DOC_COLS =
  'id, journey_id, doc_type, title, issued_date, expiry_date, file_url, status, notes, created_by, created_at, updated_at'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDocumentsPrivilege('view')

    const sb = createServerClient()
    const { data, error } = await sb
      .from('document_records').select(DOC_COLS).eq('id', params.id).maybeSingle()
    if (error) throw error
    if (!data) return apiError('document_not_found', 404)

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDocumentsPrivilege('manage')

    const body = await request.json() as {
      doc_type?: string
      title?: string
      issued_date?: string | null
      expiry_date?: string | null
      file_url?: string | null
      notes?: string | null
      status?: string
    }

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('document_records')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return apiError('document_not_found', 404)

    const update: DocumentRecordUpdate = {}

    if (body.doc_type !== undefined) {
      if (!isDocType(body.doc_type)) {
        return apiError('invalid_document_type', 400)
      }
      update.doc_type = body.doc_type
    }

    if (body.status !== undefined) {
      if (!isDocStatus(body.status)) {
        return apiError('invalid_status', 400)
      }
      update.status = body.status
    }

    if (body.title !== undefined) {
      const title = body.title?.trim()
      if (!title) {
        return apiError('title_field_not_empty', 400)
      }
      update.title = title
    }

    // issued_date/expiry_date: null/'' → очистить; строка → валидировать.
    if (body.issued_date !== undefined) {
      if (body.issued_date === null || body.issued_date === '') {
        update.issued_date = null
      } else {
        const v = body.issued_date.trim()
        if (!isIsoDate(v)) {
          return apiError('issued_date_must_be_date', 400)
        }
        update.issued_date = v
      }
    }
    if (body.expiry_date !== undefined) {
      if (body.expiry_date === null || body.expiry_date === '') {
        update.expiry_date = null
      } else {
        const v = body.expiry_date.trim()
        if (!isIsoDate(v)) {
          return apiError('expiry_date_must_be_date', 400)
        }
        update.expiry_date = v
      }
    }

    if (body.file_url !== undefined) update.file_url = body.file_url?.trim() || null
    if (body.notes !== undefined) update.notes = body.notes?.trim() || null

    if (Object.keys(update).length === 0) {
      return apiError('no_changes', 400)
    }

    const { data, error } = await sb
      .from('document_records')
      .update(update)
      .eq('id', params.id)
      .select(DOC_COLS)
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireDocumentsPrivilege('manage')

    const sb = createServerClient()

    const { data: existing, error: exErr } = await sb
      .from('document_records')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (exErr) throw exErr
    if (!existing) return apiError('document_not_found', 404)

    const { error } = await sb
      .from('document_records')
      .delete()
      .eq('id', params.id)
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
