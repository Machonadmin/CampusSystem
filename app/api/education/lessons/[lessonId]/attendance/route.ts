import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireEducationPrivilege } from '@/lib/education/permissions'
import { getLessonAccess, getEnrolledJourneyIds } from '@/lib/education/lesson-access'
import type { AttendanceStatus, AttendanceInsert } from '@/types/database'

const VALID_STATUSES: readonly AttendanceStatus[] = ['present', 'absent', 'excused', 'late']

function mapDbError(error: { code?: string; message?: string }): { status: number; message: string } {
  if (error.code === '22P02') return { status: 400, message: 'Неверный идентификатор' }
  if (error.code === '23503') return { status: 400, message: 'Ссылка на несуществующую запись' }
  if (error.code === '23514') return { status: 400, message: 'Недопустимый статус посещаемости' }
  return { status: 500, message: error.message ?? 'Ошибка БД' }
}

// Форма записи класса, записанного в группу (для отображения ростера).
type EnrollRow = {
  journey_id: string
  journey: {
    id: string
    person: { id: string; full_name: string | null; hebrew_name: string | null } | null
  } | null
}

/**
 * GET /api/education/lessons/[lessonId]/attendance
 * Посещаемость урока, наложенная на список студентов группы: каждый
 * записанный студент отдаётся со своим статусом или как не отмеченный (null).
 * Право: view_students в контексте группы урока.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { lessonId: string } }
) {
  try {
    const sb = createServerClient()

    const access = await getLessonAccess(sb, params.lessonId)
    if (!access) return NextResponse.json({ error: 'Урок не найден' }, { status: 404 })

    await requireEducationPrivilege('view_students', access.target)

    const classGroupId = access.lesson.class_group_id

    const [enrollsRes, attRes] = await Promise.all([
      sb.from('class_enrollments')
        .select(`
          journey_id,
          journey:education_journeys(
            id,
            person:persons(id, full_name, hebrew_name)
          )
        `)
        .eq('class_group_id', classGroupId),
      sb.from('attendance')
        .select('journey_id, status, marked_by, marked_at')
        .eq('lesson_id', params.lessonId),
    ])
    if (enrollsRes.error) throw enrollsRes.error
    if (attRes.error) throw attRes.error

    const statusByJourney = new Map<string, { status: AttendanceStatus; marked_by: string | null; marked_at: string | null }>()
    for (const row of attRes.data ?? []) {
      statusByJourney.set(row.journey_id, {
        status: row.status as AttendanceStatus,
        marked_by: row.marked_by,
        marked_at: row.marked_at,
      })
    }

    const enrolls = (enrollsRes.data ?? []) as unknown as EnrollRow[]
    const students = enrolls.map(row => {
      const person = row.journey?.person ?? null
      const att = statusByJourney.get(row.journey_id) ?? null
      return {
        journey_id: row.journey_id,
        full_name: person?.full_name ?? null,
        hebrew_name: person?.hebrew_name ?? null,
        status: att?.status ?? null,
        marked_by: att?.marked_by ?? null,
        marked_at: att?.marked_at ?? null,
      }
    })

    return NextResponse.json({
      lesson_id: params.lessonId,
      class_group_id: classGroupId,
      students,
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
 * POST /api/education/lessons/[lessonId]/attendance
 * Массовая отметка посещаемости. Право: mark_attendance в контексте группы урока.
 *
 * Body: { entries: { journey_id: string; status: 'present'|'absent'|'excused'|'late' }[] }
 * Upsert по паре (lesson_id, journey_id); marked_by = текущий пользователь,
 * marked_at = сейчас. Каждый journey должен быть записан в группу урока.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { lessonId: string } }
) {
  try {
    const body = await request.json() as {
      entries?: { journey_id?: string; status?: string }[]
    }

    const entries = body.entries
    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'entries обязателен (непустой массив)' }, { status: 400 })
    }

    // Валидация каждой записи
    for (const entry of entries) {
      if (!entry.journey_id) {
        return NextResponse.json({ error: 'У каждой записи должен быть journey_id' }, { status: 400 })
      }
      if (!entry.status || !VALID_STATUSES.includes(entry.status as AttendanceStatus)) {
        return NextResponse.json(
          { error: `Недопустимый статус: ${entry.status ?? '(пусто)'}. Разрешено: ${VALID_STATUSES.join(', ')}` },
          { status: 400 }
        )
      }
    }

    const sb = createServerClient()

    const access = await getLessonAccess(sb, params.lessonId)
    if (!access) return NextResponse.json({ error: 'Урок не найден' }, { status: 404 })

    const session = await requireEducationPrivilege('mark_attendance', access.target)

    // Каждый journey должен быть записан в группу урока
    const enrolledIds = await getEnrolledJourneyIds(sb, access.lesson.class_group_id)
    const notEnrolled = Array.from(new Set(entries.map(e => e.journey_id!)))
      .filter(id => !enrolledIds.has(id))
    if (notEnrolled.length > 0) {
      return NextResponse.json(
        { error: `Не записаны в группу урока: ${notEnrolled.join(', ')}` },
        { status: 400 }
      )
    }

    const markedAt = new Date().toISOString()
    const rows: AttendanceInsert[] = entries.map(e => ({
      lesson_id: params.lessonId,
      journey_id: e.journey_id!,
      status: e.status as AttendanceStatus,
      marked_by: session.person_id,
      marked_at: markedAt,
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await sb
      .from('attendance')
      .upsert(rows as any, { onConflict: 'lesson_id,journey_id' })
    if (error) {
      const m = mapDbError(error)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }

    return NextResponse.json({ marked: rows.length }, { status: 201 })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
