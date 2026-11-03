import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import {
  MAX_SUBMISSION_BYTES, isAllowedSubmissionMime, uploadSubmission, removeSubmissionFile,
} from '@/lib/education/submission-storage'
import { isMissingColumn, isMissingTable } from '@/lib/supabase/errors'
import { errorResponse } from '@/lib/api/handler'

export const runtime = 'nodejs'

/**
 * POST /api/portal/assignments/[id]/submission — ученица сдаёт מטלה файлом.
 * [id] = assessment_id. multipart: file (обяз.), note?.
 *
 * Только principal='student'; journey — ИЗ СЕССИИ. Задание должно быть
 * מטלה להגשה (requires_submission) её учебной группы. Повторная сдача заменяет
 * файл, пока работа не оценена; после выставления оценки — 409.
 * Сдача после срока разрешена (помечается как «באיחור» по submitted_at).
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const session = await getSession()
    if (!session) return apiError('unauthorized', 401)
    if (session.principal !== 'student' || !session.student_journey_id) return apiError('forbidden', 403)
    const journeyId = session.student_journey_id
    const sb = createServerClient()

    const { data: a, error: aErr } = await sb
      .from('assessments')
      .select('id, class_group_id, requires_submission')
      .eq('id', params.id)
      .maybeSingle()
    if (aErr) {
      if (isMissingColumn(aErr)) return apiError('feature_not_migrated', 503)
      throw aErr
    }
    if (!a) return apiError('assignment_not_found', 404)
    if (!a.requires_submission) return apiError('submission_not_allowed', 400)

    const { data: enr, error: eErr } = await sb
      .from('class_enrollments').select('journey_id')
      .eq('class_group_id', a.class_group_id).eq('journey_id', journeyId).limit(1)
    if (eErr) throw eErr
    if (!enr || enr.length === 0) return apiError('forbidden', 403)

    // После оценки сдачу не меняем.
    const { data: graded, error: gErr } = await sb
      .from('grades').select('id').eq('assessment_id', a.id).eq('journey_id', journeyId).limit(1)
    if (gErr) throw gErr
    if (graded && graded.length > 0) return apiError('submission_already_graded', 409)

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) return apiError('file_required', 400)
    if (file.size > MAX_SUBMISSION_BYTES) return apiError('file_too_large', 400)
    if (!isAllowedSubmissionMime(file.type)) return apiError('file_type_not_allowed', 400)
    const rawNote = form.get('note')
    const note = typeof rawNote === 'string' && rawNote.trim() !== '' ? rawNote.trim().slice(0, 2000) : null

    const { data: prev, error: pErr } = await sb
      .from('assessment_submissions').select('id, storage_path')
      .eq('assessment_id', a.id).eq('journey_id', journeyId).maybeSingle()
    if (pErr) {
      if (isMissingTable(pErr)) return apiError('feature_not_migrated', 503)
      throw pErr
    }

    const uploaded = await uploadSubmission(a.id, journeyId, file)
    const row = {
      assessment_id: a.id,
      journey_id: journeyId,
      storage_path: uploaded.storage_path,
      file_name: uploaded.file_name,
      mime_type: uploaded.mime_type,
      size_bytes: uploaded.size_bytes,
      note,
      submitted_by: session.person_id,
      submitted_at: new Date().toISOString(),
    }
    const { data, error } = await sb
      .from('assessment_submissions')
      .upsert(row, { onConflict: 'assessment_id,journey_id' })
      .select('id, file_name, submitted_at')
      .single()
    if (error) {
      await removeSubmissionFile(uploaded.storage_path)
      throw error
    }
    if (prev?.storage_path && prev.storage_path !== uploaded.storage_path) await removeSubmissionFile(prev.storage_path)

    return NextResponse.json({ submission: data }, { status: prev ? 200 : 201 })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}
