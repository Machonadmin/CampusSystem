import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error(serverT('unauthorized')), { status: 401 })
  return session
}

/**
 * DELETE /api/tasks/[id]/comments/[commentId] — удалить комментарий.
 * Доступ — автор комментария или суперадмин.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; commentId: string } }
) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()

    const { data: comment, error: cErr } = await sb
      .from('task_comments')
      .select('id, author_id')
      .eq('id', params.commentId)
      .eq('task_id', params.id)
      .maybeSingle()
    if (cErr) throw cErr
    if (!comment) {
      return apiError('comment_not_found', 404)
    }

    const isAuthor = comment.author_id === session.person_id
    const isSuperadmin = session.roles?.includes('superadmin') ?? false
    if (!isAuthor && !isSuperadmin) {
      return apiError('only_author_can_delete_comment', 403)
    }

    const { error: dErr } = await sb
      .from('task_comments')
      .delete()
      .eq('id', params.commentId)
    if (dErr) throw dErr

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
