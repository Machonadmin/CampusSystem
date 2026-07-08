import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { mapDbError } from '@/lib/calendar/http'
import { isIsoDate } from '@/lib/calendar/validation'
import { resolveMyClassGroupIds } from '@/lib/calendar/my-classes'

/**
 * ЛИЧНЫЙ календарь — уроки моих учебных групп. ТОЛЬКО чтение.
 *
 * GET /api/calendar/lessons?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   — уроки тех учебных групп (class_groups), которые касаются меня как:
 *       • преподавателя (class_teachers.teacher_id = я), ИЛИ
 *       • студента (записан через journey: class_enrollments.journey_id ∈ мои
 *         journeys, education_journeys.person_id = я).
 *     Множество групп — ОБЪЕДИНЕНИЕ обоих (resolveMyClassGroupIds). Self-scoped
 *     ровно как остальной календарь: чужие уроки НЕ отдаём. Если ни одной моей
 *     группы — []. from/to опциональны (фильтр по scheduled_date, to — включ.).
 *
 * Уроки на календаре read-only: они создаются и меняются в модуле «Education».
 * Отменённые уроки НЕ исключаем, а помечаем (is_cancelled) — UI показывает их
 * приглушённо / зачёркнуто.
 *
 * Каждый элемент: { id, class_group_id, date, time, class_group_name, subject,
 * subject_he, location, is_cancelled }. class_group_id нужен календарю, чтобы
 * подавлять повторяющиеся слоты расписания, перекрытые реальным уроком. subject —
 * name предмета, subject_he — name_he (может быть null): UI выбирает иврит, если
 * язык he и он задан — тот же приём, что в модуле Education (StudentReportTab).
 */

// Читаем постранично, чтобы не упереться в db-max-rows у активного
// преподавателя за широкий период.
const PAGE = 1000

export async function GET(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()

    const from = request.nextUrl.searchParams.get('from')?.trim()
    const to = request.nextUrl.searchParams.get('to')?.trim()
    if (from && !isIsoDate(from)) {
      return NextResponse.json({ error: 'from должен быть датой YYYY-MM-DD' }, { status: 400 })
    }
    if (to && !isIsoDate(to)) {
      return NextResponse.json({ error: 'to должен быть датой YYYY-MM-DD' }, { status: 400 })
    }

    // 1. Мои учебные группы: объединение «преподаватель ∪ студент» (постранично).
    const ids = await resolveMyClassGroupIds(sb, session.person_id)

    // Ни одной моей группы → пусто. Никогда не отдаём чужие уроки.
    if (ids.length === 0) {
      return NextResponse.json({ lessons: [] })
    }

    // 2. Уроки этих групп в диапазоне дат (постранично). Порядок с тай-брейком
    //    по id — чтобы страницы не пересекались и не теряли строк.
    type LessonRow = {
      id: string
      class_group_id: string
      scheduled_date: string
      scheduled_time: string | null
      location: string | null
      is_cancelled: boolean
    }
    const lessonRows: LessonRow[] = []
    {
      let offset = 0
      for (;;) {
        let q = sb
          .from('lessons')
          .select('id, class_group_id, scheduled_date, scheduled_time, location, is_cancelled')
          .in('class_group_id', ids)
          .order('scheduled_date', { ascending: true })
          .order('scheduled_time', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })
          .range(offset, offset + PAGE - 1)
        if (from) q = q.gte('scheduled_date', from)
        if (to) q = q.lte('scheduled_date', to)

        const { data, error } = await q
        if (error) throw error
        const page = (data ?? []) as LessonRow[]
        lessonRows.push(...page)
        if (page.length < PAGE) break
        offset += PAGE
      }
    }

    // 3. Имена групп + subject_id. Набор групп преподавателя ограничен —
    //    хватает одного запроса по .in().
    const groupById = new Map<string, { name: string; subject_id: string }>()
    {
      const { data, error } = await sb
        .from('class_groups')
        .select('id, name, subject_id')
        .in('id', ids)
      if (error) throw error
      for (const g of data ?? []) groupById.set(g.id, { name: g.name, subject_id: g.subject_id })
    }

    // 4. Предметы (name + name_he) по subject_id этих групп.
    const subjectIds = Array.from(
      new Set(Array.from(groupById.values()).map(g => g.subject_id)),
    )
    const subjectById = new Map<string, { name: string; name_he: string | null }>()
    if (subjectIds.length > 0) {
      const { data, error } = await sb
        .from('subjects')
        .select('id, name, name_he')
        .in('id', subjectIds)
      if (error) throw error
      for (const s of data ?? []) subjectById.set(s.id, { name: s.name, name_he: s.name_he })
    }

    // 5. Сборка ответа. Дедуп по id (страницы не должны пересекаться, но
    //    страхуемся: один урок = одна строка).
    const byId = new Map<string, {
      id: string
      class_group_id: string
      date: string
      time: string | null
      class_group_name: string
      subject: string
      subject_he: string | null
      location: string | null
      is_cancelled: boolean
    }>()
    for (const l of lessonRows) {
      if (byId.has(l.id)) continue
      const g = groupById.get(l.class_group_id)
      const s = g ? subjectById.get(g.subject_id) : undefined
      byId.set(l.id, {
        id: l.id,
        class_group_id: l.class_group_id,
        date: l.scheduled_date,
        time: l.scheduled_time,
        class_group_name: g?.name ?? '',
        subject: s?.name ?? '',
        subject_he: s?.name_he ?? null,
        location: l.location,
        is_cancelled: l.is_cancelled,
      })
    }

    return NextResponse.json({ lessons: [...byId.values()] })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? 'Ошибка' }, { status: e.status ?? 500 })
  }
}
