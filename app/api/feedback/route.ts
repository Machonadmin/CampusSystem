import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { errorResponse, requireStaff } from '@/lib/api/handler'
import { createServerClient } from '@/lib/supabase/server'
import { canSubmitFeedback, isFeedbackOwner } from '@/lib/feedback/access'
import {
  isFeedbackKind, normalizeBody, normalizePagePath, checkScreenshots,
} from '@/lib/feedback/validation'
import {
  uploadScreenshot, removeScreenshots, signScreenshots, parseStoredScreenshots,
  type StoredScreenshot,
} from '@/lib/feedback/storage'

/**
 * /api/feedback — «הצעה לשיפור או באג».
 *
 * POST — сотрудник с правом feedback.submit отправляет замечание: поля формы
 *   kind ('bug' | 'suggestion'), body (текст), page (путь страницы, с которой
 *   пишут), screenshots (0–5 картинок). Замечание только сохраняется — само
 *   по себе оно ничего в системе не меняет; дальше решает владелец.
 * GET  — свои замечания со статусом и ответом владельца. superadmin (владелец)
 *   получает все замечания, с именем автора.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COLS =
  'id, kind, body, page_url, screenshots, created_by, status, owner_reply, status_changed_at, created_at'

export async function GET() {
  try {
    const session = await requireStaff()
    const owner = isFeedbackOwner(session)
    if (!owner && !(await canSubmitFeedback(session))) return apiError('forbidden', 403)

    const sb = createServerClient()
    let q = sb.from('feedback_reports').select(COLS).order('created_at', { ascending: false }).limit(200)
    if (!owner) q = q.eq('created_by', session.person_id)
    const { data, error } = await q
    if (error) throw error

    const rows = data ?? []
    const names = new Map<string, string | null>()
    if (owner && rows.length > 0) {
      const ids = [...new Set(rows.map(r => r.created_by))]
      const { data: people } = await sb.from('persons').select('id, full_name').in('id', ids)
      for (const p of people ?? []) names.set(p.id, p.full_name)
    }

    const items = await Promise.all(rows.map(async r => ({
      id: r.id,
      kind: r.kind,
      body: r.body,
      page_url: r.page_url,
      status: r.status,
      owner_reply: r.owner_reply,
      status_changed_at: r.status_changed_at,
      created_at: r.created_at,
      author_name: owner ? (names.get(r.created_by) ?? null) : undefined,
      screenshots: await signScreenshots(parseStoredScreenshots(r.screenshots)),
    })))

    return NextResponse.json({ items, is_owner: owner })
  } catch (err: unknown) {
    return errorResponse(err as { status?: number; message?: string })
  }
}

export async function POST(request: NextRequest) {
  const uploaded: StoredScreenshot[] = []
  try {
    const session = await requireStaff()
    if (!(await canSubmitFeedback(session))) return apiError('forbidden', 403)

    const form = await request.formData()
    const kind = form.get('kind')
    if (!isFeedbackKind(kind)) return apiError('feedback_invalid_kind', 400)
    const body = normalizeBody(form.get('body'))
    if (!body) return apiError('feedback_text_required', 400)
    const page = normalizePagePath(form.get('page'))

    const files = form.getAll('screenshots').filter((f): f is File => f instanceof File && f.size > 0)
    const problem = checkScreenshots(files)
    if (problem === 'too_many') return apiError('feedback_too_many_screenshots', 400)
    if (problem === 'bad_type') return apiError('feedback_bad_screenshot_type', 400)
    if (problem === 'too_large') return apiError('feedback_screenshot_too_large', 400)

    // Все скриншоты грузим одновременно, а не по очереди. Загрузившиеся
    // попадают в uploaded, чтобы catch убрал их, если что-то не удалось.
    const results = await Promise.allSettled(files.map(f => uploadScreenshot(session.person_id, f)))
    for (const r of results) if (r.status === 'fulfilled') uploaded.push(r.value)
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (failed) throw failed.reason

    const sb = createServerClient({ actorPersonId: session.person_id })
    const { data, error } = await sb
      .from('feedback_reports')
      .insert({
        kind,
        body,
        page_url: page,
        user_agent: (request.headers.get('user-agent') ?? '').slice(0, 300) || null,
        screenshots: uploaded,
        created_by: session.person_id,
      })
      .select('id, status, created_at')
      .single()
    if (error) throw error

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    await removeScreenshots(uploaded.map(u => u.path))
    return errorResponse(err as { status?: number; message?: string })
  }
}
