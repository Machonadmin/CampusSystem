import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

async function requireAuth() {
  const session = await getSession()
  if (!session) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return session
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const sb = createServerClient()
    const params = request.nextUrl.searchParams
    const tab = params.get('tab') ?? 'planned'
    const teacherId = params.get('teacher_id')
    const search = params.get('search') ?? ''

    let query = sb
      .from('quality_checks')
      .select('*')
      .order('lesson_date', { ascending: false })
      .order('lesson_time', { ascending: false })

    if (tab === 'planned') {
      query = query.in('status', ['planned', 'in_progress'])
    } else {
      query = query.eq('status', 'completed')
    }

    if (teacherId) query = query.eq('teacher_person_id', teacherId)
    if (search) query = query.or(`group_name.ilike.%${search}%,course_name.ilike.%${search}%`)

    const { data: checks, error } = await query
    if (error) throw error

    if (!checks || checks.length === 0) return NextResponse.json([])

    const personIds = [
      ...new Set([
        ...checks.map(c => c.observer_person_id),
        ...checks.map(c => c.teacher_person_id),
      ]),
    ]

    const { data: persons } = await sb
      .from('persons')
      .select('id, full_name')
      .in('id', personIds)

    const personMap = new Map((persons ?? []).map(p => [p.id, p.full_name]))

    const templateIds = [...new Set(checks.map(c => c.template_id).filter((id): id is string => id !== null))]

    const { data: templates } = templateIds.length > 0
      ? await sb.from('quality_check_templates').select('id, name').in('id', templateIds)
      : { data: [] }

    const templateMap = new Map((templates ?? []).map(t => [t.id, t.name]))

    const result = checks.map(c => ({
      ...c,
      observer_name: personMap.get(c.observer_person_id) ?? null,
      teacher_name: personMap.get(c.teacher_person_id) ?? null,
      template_name: c.template_id ? (templateMap.get(c.template_id) ?? null) : null,
    }))

    return NextResponse.json(result)
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    const sb = createServerClient()
    const body = await request.json() as {
      template_id?: string
      lesson_date?: string
      lesson_time?: string
      observer_person_id?: string
      teacher_person_id?: string
      group_name?: string
      course_name?: string
      status?: string
    }

    if (!body.lesson_date) return NextResponse.json({ error: 'Дата урока обязательна' }, { status: 400 })
    if (!body.lesson_time) return NextResponse.json({ error: 'Время урока обязательно' }, { status: 400 })
    if (!body.observer_person_id) return NextResponse.json({ error: 'Наблюдатель обязателен' }, { status: 400 })
    if (!body.teacher_person_id) return NextResponse.json({ error: 'Преподаватель обязателен' }, { status: 400 })

    const { data, error } = await sb
      .from('quality_checks')
      .insert({
        template_id: body.template_id ?? null,
        lesson_date: body.lesson_date,
        lesson_time: body.lesson_time,
        observer_person_id: body.observer_person_id,
        teacher_person_id: body.teacher_person_id,
        group_name: body.group_name?.trim() || null,
        course_name: body.course_name?.trim() || null,
        status: body.status ?? 'planned',
        created_by: session.person_id,
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
