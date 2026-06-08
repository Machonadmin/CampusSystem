import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

export async function GET(
  _request: NextRequest,
  { params }: { params: { journeyId: string } }
) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

    const sb = createServerClient()

    const { data: instances, error } = await sb
      .from('process_instances')
      .select(`
        id, status, started_at, finished_at, finish_reason,
        template:process_templates(id, code, name_ru),
        stages:stage_instances(
          id, status, final_code, activated_at, completed_at,
          stage_template:stage_templates(id, code, name_ru, sort_order, finals:stage_finals(code, name_ru, is_positive))
        )
      `)
      .eq('journey_id', params.journeyId)
      .order('started_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ processes: instances ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
