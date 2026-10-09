import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { errorResponse, requireStaff } from '@/lib/api/handler'
import { createServerClient } from '@/lib/supabase/server'
import { isFeedbackOwner } from '@/lib/feedback/access'
import { parseStatusPatch } from '@/lib/feedback/validation'

/**
 * PATCH /api/feedback/[id] — владелец (superadmin) меняет статус замечания и/или
 * пишет ответ автору: { status?, owner_reply? }. Автор видит это на экране
 * «ההערות שלי».
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  try {
    const session = await requireStaff()
    if (!isFeedbackOwner(session)) return apiError('forbidden', 403)

    let raw: unknown
    try { raw = await request.json() } catch { return apiError('invalid_reference', 400) }
    const patch = parseStatusPatch(raw)
    if (!patch) return apiError('invalid_status', 400)

    const sb = createServerClient({ actorPersonId: session.person_id })
    const { data, error } = await sb
      .from('feedback_reports')
      .update({
        ...patch,
        ...(patch.status ? { status_changed_at: new Date().toISOString() } : {}),
      })
      .eq('id', id)
      .select('id, status, owner_reply, status_changed_at')
      .maybeSingle()
    if (error) throw error
    if (!data) return apiError('not_found', 404)
    return NextResponse.json(data)
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
