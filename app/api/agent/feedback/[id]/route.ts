import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { agentAuthGuard } from '@/lib/feedback/agent-auth'
import { parseStatusPatch } from '@/lib/feedback/validation'

/**
 * PATCH /api/agent/feedback/[id] — Claude меняет статус замечания и/или ответ
 * автору ({ status?, owner_reply? }) по решению владельца в проекте.
 * Авторизация — как у GET /api/agent/feedback. Больше этот вход ничего не умеет.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const denied = agentAuthGuard(request)
  if (denied) return denied

  const { id } = await props.params
  let raw: unknown
  try { raw = await request.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const patch = parseStatusPatch(raw)
  if (!patch) return NextResponse.json({ error: 'bad patch' }, { status: 400 })

  try {
    const sb = createServerClient()
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
    if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(data)
  } catch (err: unknown) {
    console.error('[agent/feedback] PATCH failed:', (err as { message?: string })?.message ?? err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
