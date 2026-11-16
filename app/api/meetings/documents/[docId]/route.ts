import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { errorResponse } from '@/lib/api/handler'
import { DOCUMENTS_BUCKET, getSignedUrl } from '@/lib/documents/storage'
import { db, loadMeeting } from '@/lib/meetings/access'

/**
 * GET    /api/meetings/documents/[docId] → { url } — подписанная ссылка на 5 минут.
 * DELETE /api/meetings/documents/[docId] — удалить файл.
 * Владелец встречи или секретарь (право «подготовка»).
 */

async function gate(docId: string) {
  const session = await requireCalendarUser()
  const sb = createServerClient()
  const { data, error } = await db(sb).from('appointment_documents').select('id, appointment_id, storage_path').eq('id', docId).maybeSingle()
  if (error) throw error
  if (!data) return { err: apiError('record_not_found', 404) }
  const doc = data as { id: string; appointment_id: string; storage_path: string }
  const m = await loadMeeting(sb, session, doc.appointment_id)
  if (!m || !m.visibility.prep) return { err: apiError('forbidden', 403) }
  return { sb, doc }
}

export async function GET(_req: NextRequest, props: { params: Promise<{ docId: string }> }) {
  try {
    const g = await gate((await props.params).docId)
    if ('err' in g) return g.err
    return NextResponse.json({ url: await getSignedUrl(g.doc.storage_path) })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ docId: string }> }) {
  try {
    const g = await gate((await props.params).docId)
    if ('err' in g) return g.err
    const { error } = await db(g.sb).from('appointment_documents').delete().eq('id', g.doc.id)
    if (error) throw error
    const { error: sErr } = await g.sb.storage.from(DOCUMENTS_BUCKET).remove([g.doc.storage_path])
    if (sErr) console.error('[meetings] storage remove:', sErr)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
