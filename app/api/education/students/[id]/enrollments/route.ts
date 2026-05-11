import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

/**
 * GET /api/education/students/[id]/enrollments
 * В каких учебных группах состоит этот студент.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth()
    const sb = createServerClient()

    const { data, error } = await sb
      .from('class_enrollments')
      .select(`
        student_id,
        class_group_id,
        enrolled_at,
        class_group:class_groups(
          id,
          name,
          level,
          period_start,
          period_end,
          subject:subjects(id, name),
          department:departments(id, name)
        )
      `)
      .eq('student_id', params.id)
      .order('enrolled_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ enrollments: data ?? [] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
