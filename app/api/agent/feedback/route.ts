import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { agentAuthGuard } from '@/lib/feedback/agent-auth'
import { isFeedbackStatus } from '@/lib/feedback/validation'
import { signScreenshots, parseStoredScreenshots } from '@/lib/feedback/storage'

/**
 * GET /api/agent/feedback?status=new — вход для Claude (см. docs/feedback-channel.md).
 *
 * Раз в день (и по просьбе владельца) Claude забирает отсюда замечания
 * сотрудников и приносит их владельцу в проект. Авторизация — заголовок
 * Authorization: Bearer <FEEDBACK_AGENT_TOKEN> (fail-closed, lib/feedback/agent-auth).
 * Маршрут в PUBLIC_API_PREFIXES middleware: у Claude нет сессии сайта.
 *
 * status — один из статусов или 'all' (по умолчанию 'new'). Скриншоты отдаются
 * подписанными ссылками на 1 час.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const denied = agentAuthGuard(request)
  if (denied) return denied

  try {
    const statusParam = request.nextUrl.searchParams.get('status') ?? 'new'
    if (statusParam !== 'all' && !isFeedbackStatus(statusParam)) {
      return NextResponse.json({ error: 'bad status' }, { status: 400 })
    }

    const sb = createServerClient()
    let q = sb
      .from('feedback_reports')
      .select('id, kind, body, page_url, user_agent, screenshots, created_by, status, owner_reply, status_changed_at, created_at')
      .order('created_at', { ascending: true })
      .limit(100)
    if (statusParam !== 'all') q = q.eq('status', statusParam)
    const { data, error } = await q
    if (error) throw error

    const rows = data ?? []
    const ids = [...new Set(rows.map(r => r.created_by))]
    const names = new Map<string, string | null>()
    if (ids.length > 0) {
      const { data: people } = await sb.from('persons').select('id, full_name').in('id', ids)
      for (const p of people ?? []) names.set(p.id, p.full_name)
    }

    const items = await Promise.all(rows.map(async r => ({
      id: r.id,
      kind: r.kind,
      body: r.body,
      page_url: r.page_url,
      user_agent: r.user_agent,
      status: r.status,
      owner_reply: r.owner_reply,
      created_at: r.created_at,
      author_name: names.get(r.created_by) ?? null,
      screenshots: await signScreenshots(parseStoredScreenshots(r.screenshots), 3600),
    })))

    return NextResponse.json({ items })
  } catch (err: unknown) {
    console.error('[agent/feedback] GET failed:', (err as { message?: string })?.message ?? err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
