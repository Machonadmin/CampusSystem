import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { agentAuthGuard } from '@/lib/feedback/agent-auth'
import { MAX_SCREENSHOTS, isScreenshotMime } from '@/lib/feedback/validation'
import { downloadScreenshot, parseStoredScreenshots } from '@/lib/feedback/storage'

/**
 * GET /api/agent/feedback/[id]/screenshots/[index] — сам файл скриншота
 * замечания (index с 0, в порядке списка screenshots). Для Claude: подписанные
 * ссылки ведут на домен Supabase, куда у него нет выхода, а сайт — есть.
 * Авторизация — как у GET /api/agent/feedback (FEEDBACK_AGENT_TOKEN, fail-closed).
 * Только чтение.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest, props: { params: Promise<{ id: string; index: string }> }) {
  const denied = agentAuthGuard(request)
  if (denied) return denied

  const { id, index } = await props.params
  const n = Number(index)
  if (!UUID_RE.test(id) || !/^\d+$/.test(index) || n >= MAX_SCREENSHOTS) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 })
  }

  try {
    const { data, error } = await createServerClient()
      .from('feedback_reports')
      .select('screenshots')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    const shot = parseStoredScreenshots(data?.screenshots)[n]
    if (!shot) return NextResponse.json({ error: 'not found' }, { status: 404 })

    const file = await downloadScreenshot(shot.path)
    return new Response(file, {
      headers: {
        'Content-Type': isScreenshotMime(shot.mime) ? shot.mime : 'application/octet-stream',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err: unknown) {
    console.error('[agent/feedback] screenshot failed:', (err as { message?: string })?.message ?? err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
