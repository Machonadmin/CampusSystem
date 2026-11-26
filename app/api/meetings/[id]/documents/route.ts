import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireModuleUser } from '@/lib/modules/personal-access'
import { errorResponse } from '@/lib/api/handler'
import { DOCUMENTS_BUCKET, MAX_UPLOAD_BYTES, isAllowedMime, sanitizeFileName } from '@/lib/documents/storage'
import { db, loadMeeting } from '@/lib/meetings/access'

/**
 * POST /api/meetings/[id]/documents (multipart: file) — מסמך לפני פגישה.
 * Владелец или секретарь. Приватный бакет documents, путь appointments/<id>/….
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params
    const session = await requireModuleUser('meetings')
    const sb = createServerClient()
    const m = await loadMeeting(sb, session, id)
    if (!m) return apiError('meeting_not_found', 404)
    if (!m.visibility.prep) return apiError('forbidden', 403)

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) return apiError('file_required', 400)
    if (file.size > MAX_UPLOAD_BYTES) return apiError('file_too_large', 400)
    if (!isAllowedMime(file.type)) return apiError('file_type_not_allowed', 400)

    const safeName = sanitizeFileName(file.name)
    const path = `appointments/${id}/${randomUUID()}-${safeName}`
    const { error: upErr } = await sb.storage.from(DOCUMENTS_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type, upsert: false,
    })
    if (upErr) throw Object.assign(new Error(upErr.message), { status: 500 })

    const { data, error } = await db(sb).from('appointment_documents').insert({
      appointment_id: id, storage_path: path, file_name: file.name.slice(0, 200) || safeName,
      mime_type: file.type, size_bytes: file.size, uploaded_by: session.person_id,
    }).select('id').single()
    if (error) throw error
    return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
