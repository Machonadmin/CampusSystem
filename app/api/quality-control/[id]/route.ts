import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth()
    const sb = createServerClient()

    const { data, error } = await sb
      .from('quality_checks')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) throw error
    if (!data) return NextResponse.json({ error: 'Не найдено' }, { status: 404 })
    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth()
    const sb = createServerClient()
    const body = await request.json() as Record<string, unknown>

    const allowed = [
      'template_id', 'lesson_date', 'lesson_time', 'observer_person_id', 'teacher_person_id',
      'group_name', 'course_name', 'started_on_time', 'delay_minutes', 'delay_reason',
      'technical_issues', 'answers', 'strengths', 'areas_for_improvement', 'action_item',
      'overall_rating', 'teacher_feedback', 'status', 'completed_at',
    ]
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }

    if (update.status === 'completed' && !update.completed_at) {
      update.completed_at = new Date().toISOString()
    }

    const { data, error } = await sb
      .from('quality_checks')
      .update(update)
      .eq('id', params.id)
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAuth()
    const sb = createServerClient()

    const { error } = await sb
      .from('quality_checks')
      .delete()
      .eq('id', params.id)

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
