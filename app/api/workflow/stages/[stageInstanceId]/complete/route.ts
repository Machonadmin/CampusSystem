import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'
import { completeStage } from '@/lib/workflow/complete-stage'

export async function POST(
  request: NextRequest,
  { params }: { params: { stageInstanceId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const body = await request.json() as {
      final_code: string
      result_data?: Record<string, unknown>
    }
    if (!body.final_code) {
      return NextResponse.json({ error: 'final_code обязателен' }, { status: 400 })
    }

    const sb = createServerClient()
    const result = await completeStage(
      sb,
      params.stageInstanceId,
      body.final_code,
      session.person_id,
      body.result_data,
    )

    return NextResponse.json({ ok: true, ...result })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
