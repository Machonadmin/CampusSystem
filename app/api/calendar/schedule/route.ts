import { NextRequest, NextResponse } from 'next/server'
import { apiError, serverT } from '@/lib/i18n/api-errors'
import { createServerClient } from '@/lib/supabase/server'
import { requireCalendarUser } from '@/lib/calendar/permissions'
import { mapDbError } from '@/lib/calendar/http'
import { isIsoDate } from '@/lib/calendar/validation'
import { resolveMyClassGroupIds } from '@/lib/calendar/my-classes'

/**
 * ЛИЧНЫЙ календарь — ФИКСИРОВАННОЕ недельное расписание моих групп. Read-only.
 *
 * GET /api/calendar/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   — повторяющиеся слоты (class_schedule_slots) тех же групп, что и уроки:
 *     объединение «преподаватель ∪ студент» (resolveMyClassGroupIds). Слот НЕ
 *     имеет даты (это правило «каждый вторник 10:00»), поэтому from/to здесь
 *     только валидируются для единообразия API, но фильтром НЕ применяются:
 *     разворот слотов в конкретные дни диапазона делает клиент чистой функцией
 *     expandScheduleSlots. Если ни одной моей группы — { slots: [] }.
 *
 * Каждый слот: { id, class_group_id, day_of_week (ISO 1=Пн..7=Вс), start_time,
 * end_time, room, class_group_name, subject_name, subject_name_he }.
 */

// Читаем постранично: слотов у активного пользователя может быть много.
const PAGE = 1000

export async function GET(request: NextRequest) {
  try {
    const session = await requireCalendarUser()
    const sb = createServerClient()

    // from/to валидируем (единообразие API), но к слотам не применяем —
    // у слота нет даты, разворот в диапазон делает клиент.
    const from = request.nextUrl.searchParams.get('from')?.trim()
    const to = request.nextUrl.searchParams.get('to')?.trim()
    if (from && !isIsoDate(from)) {
      return apiError('from_must_be_date', 400)
    }
    if (to && !isIsoDate(to)) {
      return apiError('to_must_be_date', 400)
    }

    // 1. Мои учебные группы: объединение «преподаватель ∪ студент» (постранично).
    const ids = await resolveMyClassGroupIds(sb, session.person_id)
    if (ids.length === 0) {
      return NextResponse.json({ slots: [] })
    }

    // 2. Слоты этих групп (постранично). Тай-брейк по id — устойчивая пагинация.
    type SlotRow = {
      id: string
      class_group_id: string
      day_of_week: number
      start_time: string
      end_time: string
      room: string | null
    }
    const slotRows: SlotRow[] = []
    {
      let offset = 0
      for (;;) {
        const { data, error } = await sb
          .from('class_schedule_slots')
          .select('id, class_group_id, day_of_week, start_time, end_time, room')
          .in('class_group_id', ids)
          .order('day_of_week', { ascending: true })
          .order('start_time', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + PAGE - 1)
        if (error) throw error
        const page = (data ?? []) as SlotRow[]
        slotRows.push(...page)
        if (page.length < PAGE) break
        offset += PAGE
      }
    }

    // 3. Имена групп + subject_id (набор групп ограничен — один .in()).
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

    // 5. Сборка ответа.
    const slots = slotRows.map(sl => {
      const g = groupById.get(sl.class_group_id)
      const subj = g ? subjectById.get(g.subject_id) : undefined
      return {
        id: sl.id,
        class_group_id: sl.class_group_id,
        day_of_week: sl.day_of_week,
        start_time: sl.start_time,
        end_time: sl.end_time,
        room: sl.room,
        class_group_name: g?.name ?? '',
        subject_name: subj?.name ?? '',
        subject_name_he: subj?.name_he ?? null,
      }
    })

    return NextResponse.json({ slots })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; code?: string }
    if (e.code) {
      const m = mapDbError(e)
      return NextResponse.json({ error: m.message }, { status: m.status })
    }
    return NextResponse.json({ error: e.message ?? serverT('generic_error') }, { status: e.status ?? 500 })
  }
}
