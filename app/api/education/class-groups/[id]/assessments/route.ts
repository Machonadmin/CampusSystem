import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getClassGroupTarget, getEnrolledJourneyIds } from '@/lib/education/lesson-access'
import type { AssessmentInsert } from '@/types/database'

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: 'Неверный идентификатор' }
  if (error.code === '23503') return { status: 400, message: 'Ссылка на несуществующую запись' }
  if (error.code === '23514') return { status: 400, message: 'Нарушено ограничение БД (проверьте max_score)' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

/**
 * GET /api/education/class-groups/[id]/assessments
 * Список заданий/работ учебной группы по убыванию assessment_date (NULL — последними).
 * Каждое задание дополнено graded_count (сколько выставлено оценок),
 * а ответ — enrolled_count (сколько студентов записано в группу).
 * Право: view_students в контексте группы.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sb = createServerClient()

    const target = await getClassGroupTarget(sb, params.id)
    if (!target) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 })

    await requireEducationPrivilege('view_students', target)

    const { data, error } = await sb
      .from('assessments')
      .select('*')
      .eq('class_group_id', params.id)
      .order('assessment_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) throw error

    const assessments = data ?? []

    // Сводка: сколько выставлено оценок у каждого задания + сколько записано в группу
    const enrolledIds = await getEnrolledJourneyIds(sb, params.id)

    const gradedByAssessment = new Map<string, number>()
    if (assessments.length > 0) {
      const ids = assessments.map(a => a.id)
      const { data: gradeRows, error: gErr } = await sb
        .from('grades')
        .select('assessment_id')
        .in('assessment_id', ids)
      if (gErr) throw gErr
      for (const row of gradeRows ?? []) {
        gradedByAssessment.set(row.assessment_id, (gradedByAssessment.get(row.assessment_id) ?? 0) + 1)
      }
    }

    return NextResponse.json({
      assessments: assessments.map(a => ({ ...a, graded_count: gradedByAssessment.get(a.id) ?? 0 })),
      enrolled_count: enrolledIds.size,
    })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}

/**
 * POST /api/education/class-groups/[id]/assessments
 * Создание задания. Право: set_grades в контексте группы.
 *
 * Body: { title (обязательно), max_score?, assessment_date?, description? }
 * max_score по умолчанию 100, должен быть > 0. created_by = текущий пользователь.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json() as {
      title?: string
      max_score?: number
      assessment_date?: string | null
      description?: string | null
    }

    const title = body.title?.trim()
    if (!title) {
      return NextResponse.json({ error: 'title обязателен' }, { status: 400 })
    }

    let maxScore = 100
    if (body.max_score !== undefined && body.max_score !== null) {
      maxScore = Number(body.max_score)
      if (!Number.isFinite(maxScore) || maxScore <= 0) {
        return NextResponse.json({ error: 'max_score должен быть больше 0' }, { status: 400 })
      }
    }

    const sb = createServerClient()

    const target = await getClassGroupTarget(sb, params.id)
    if (!target) return NextResponse.json({ error: 'Группа не найдена' }, { status: 404 })

    const session = await requireEducationPrivilege('set_grades', target)

    const insert: AssessmentInsert = {
      class_group_id: params.id,
      title,
      max_score: maxScore,
      assessment_date: body.assessment_date?.trim() || null,
      description: body.description?.trim() || null,
      created_by: session.person_id,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from('assessments')
      .insert(insert as any)
      .select('*')
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
