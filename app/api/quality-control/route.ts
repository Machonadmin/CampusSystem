import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireFeaturePrivilege } from '@/lib/auth/feature-privileges'
import { jsonError } from '@/lib/api/handler'

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const tab = params.get('tab') ?? 'planned'
    const teacherId = params.get('teacher_id')
    const search = params.get('search') ?? ''

    await requireFeaturePrivilege('quality_control', tab === 'planned' ? 'planned' : 'history', 'can_view')

    const sb = createServerClient()
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
    if (search) {
      // Экранируем спецсимволы PostgREST-фильтра (запятая/скобки/звёздочка),
      // иначе значение из строки поиска могло бы инъектировать доп. условия в .or().
      const safe = search.replace(/[,()*\\]/g, ' ').trim()
      if (safe) query = query.or(`group_name.ilike.%${safe}%,course_name.ilike.%${safe}%`)
    }

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
    return jsonError(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireFeaturePrivilege('quality_control', 'planned', 'can_create')
    const sb = createServerClient()
    const body = await request.json() as {
      template_id?: string
      class_group_id?: string | null
      lesson_date?: string
      lesson_time?: string
      observer_person_id?: string
      teacher_person_id?: string
      group_name?: string
      course_name?: string
      status?: string
    }

    if (!body.lesson_date) return apiError('lesson_date_required', 400)
    if (!body.lesson_time) return apiError('lesson_time_required', 400)
    if (!body.observer_person_id) return apiError('observer_required', 400)
    if (!body.teacher_person_id) return apiError('teacher_required', 400)

    const { data, error } = await sb
      .from('quality_checks')
      .insert({
        template_id: body.template_id ?? null,
        class_group_id: body.class_group_id ?? null,
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
    return jsonError(err)
  }
}
