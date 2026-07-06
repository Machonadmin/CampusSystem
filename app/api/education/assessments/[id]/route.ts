import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getAssessmentAccess } from '@/lib/education/lesson-access'
import type { AssessmentUpdate } from '@/types/database'

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: 'Неверный идентификатор' }
  if (error.code === '23503') return { status: 400, message: 'Ссылка на несуществующую запись' }
  if (error.code === '23514') return { status: 400, message: 'Нарушено ограничение БД (проверьте max_score)' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

/**
 * GET /api/education/assessments/[id]
 * Одно задание вместе с его оценками.
 * Право: view_students в контексте группы задания.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sb = createServerClient()

    const access = await getAssessmentAccess(sb, params.id)
    if (!access) return NextResponse.json({ error: 'Задание не найдено' }, { status: 404 })

    await requireEducationPrivilege('view_students', access.target)

    const { data: grades, error } = await sb
      .from('grades')
      .select('id, journey_id, score, comment, graded_by, graded_at')
      .eq('assessment_id', params.id)
    if (error) throw error

    return NextResponse.json({ ...access.assessment, grades: grades ?? [] })
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
 * PATCH /api/education/assessments/[id]
 * Редактирование задания. Право: set_grades в контексте группы задания.
 * Разрешено менять: title, max_score, assessment_date, description.
 */
export async function PATCH(
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

    const sb = createServerClient()

    const access = await getAssessmentAccess(sb, params.id)
    if (!access) return NextResponse.json({ error: 'Задание не найдено' }, { status: 404 })

    await requireEducationPrivilege('set_grades', access.target)

    const update: AssessmentUpdate = {}
    if (body.title !== undefined) {
      const t = body.title?.trim()
      if (!t) return NextResponse.json({ error: 'title не может быть пустым' }, { status: 400 })
      update.title = t
    }
    if (body.max_score !== undefined) {
      const ms = Number(body.max_score)
      if (!Number.isFinite(ms) || ms <= 0) {
        return NextResponse.json({ error: 'max_score должен быть больше 0' }, { status: 400 })
      }
      update.max_score = ms
    }
    if (body.assessment_date !== undefined) update.assessment_date = body.assessment_date?.trim() || null
    if (body.description !== undefined) update.description = body.description?.trim() || null

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нет изменений' }, { status: 400 })
    }

    // Понижение max_score недопустимо, если есть оценки, которые его превышают —
    // иначе в БД останутся grades со score > max_score. Сначала их нужно исправить.
    if (update.max_score !== undefined) {
      const { count: overCount, error: overErr } = await sb
        .from('grades')
        .select('id', { count: 'exact', head: true })
        .eq('assessment_id', params.id)
        .gt('score', update.max_score)
      if (overErr) throw overErr
      if (overCount && overCount > 0) {
        return NextResponse.json(
          { error: `Нельзя установить max_score=${update.max_score}: ${overCount} оценок превышают это значение. Сначала исправьте их.` },
          { status: 400 }
        )
      }
    }

    const { data, error } = await sb
      .from('assessments')
      .update(update)
      .eq('id', params.id)
      .select('*')
      .single()
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json(data)
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
 * DELETE /api/education/assessments/[id]
 * Удаление задания. Право: set_grades в контексте группы задания.
 * Оценки удаляются каскадно (ON DELETE CASCADE).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sb = createServerClient()

    const access = await getAssessmentAccess(sb, params.id)
    if (!access) return NextResponse.json({ error: 'Задание не найдено' }, { status: 404 })

    await requireEducationPrivilege('set_grades', access.target)

    const { error } = await sb.from('assessments').delete().eq('id', params.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
