import { createServerClient } from '@/lib/supabase/server'
import { effectiveTeacherIds } from './slot-fields'

// ─── Проверка конфликтов ПРИ СОЗДАНИИ/ПРАВКЕ слота (מנוע התנגשויות) ───────────
//
// Отличается от schedule-conflicts.ts (чистая визуализация всей сетки:
// teacher/room). Здесь — обращение к БД для ОДНОГО слота-кандидата: в одно время
// МОЖНО несколько уроков, но НЕЛЬЗЯ совпадение (1) кабинета, (2) преподавателя,
// (3) учениц. НЕ блокировка — возвращаем предупреждения, клиент показывает и
// предлагает альтернативу. Кабинет — по нормализованному тексту room (пусто →
// не проверяем).

export type SlotConflictKind = 'room' | 'teacher' | 'students'

export interface SlotConflict {
  kind: SlotConflictKind
  group_name: string
  detail?: string // room — кабинет; students — сколько общих
}

interface Candidate {
  classGroupId: string
  dayOfWeek: number
  startSec: number
  endSec: number
  room: string | null
  roomId?: string | null // приоритетное совпадение по реестру кабинетов
  teacherId?: string | null // собственный преподаватель слота (NULL = все преподаватели группы)
}

function timeToSeconds(t: string | null): number | null {
  if (!t) return null
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + (m[3] ? Number(m[3]) : 0)
}

function normRoom(r: string | null): string { return (r ?? '').trim().toLowerCase() }

export async function detectSlotConflicts(
  sb: ReturnType<typeof createServerClient>,
  cand: Candidate,
  excludeSlotId?: string,
): Promise<SlotConflict[]> {
  // room_id — из реестра кабинетов (buildings→rooms). Совпадение по room_id
  // надёжнее текста (одна и та же комната, разное написание). Deploy-safe:
  // колонки нет → '*'-fallback без room_id (тогда сверяем только по тексту).
  // Постранично: без .range() PostgREST молча срезает выборку на db-max-rows —
  // при большом расписании часть конфликтов «исчезала» бы из проверки.
  const slotRows: Array<{ id: string; class_group_id: string; start_time: string; end_time: string; room: string | null; room_id?: string | null; teacher_id?: string | null }> = []
  {
    const PAGE = 1000
    for (let fromRow = 0; ; fromRow += PAGE) {
      // select('*') — деплой-безопасно: room_id (20260721120000) и teacher_id
      // (20260915120000) могут ещё не существовать, а перечисление колонок по
      // имени вернуло бы 42703 на весь запрос. Раньше здесь был ручной откат на
      // проекцию без room_id; со второй новой колонкой он превратился бы в
      // лестницу вариантов, поэтому заменён на '*'.
      const r = await sb.from('class_schedule_slots')
        .select('*')
        .eq('day_of_week', cand.dayOfWeek)
        .range(fromRow, fromRow + PAGE - 1)
      const rows = (r.data ?? []) as typeof slotRows
      slotRows.push(...rows)
      if (rows.length < PAGE) break
    }
  }
  const others = (slotRows ?? []).filter(s => {
    if (s.class_group_id === cand.classGroupId) return false
    if (excludeSlotId && s.id === excludeSlotId) return false
    const os = timeToSeconds(s.start_time), oe = timeToSeconds(s.end_time)
    if (os === null || oe === null) return false
    return os < cand.endSec && oe > cand.startSec
  })
  if (others.length === 0) return []

  const otherGroupIds = [...new Set(others.map(s => s.class_group_id))]
  const allGroupIds = [...new Set([cand.classGroupId, ...otherGroupIds])]

  const nameById = new Map<string, string>()
  {
    const { data } = await sb.from('class_groups').select('id, name').in('id', allGroupIds)
    for (const g of (data ?? []) as Array<{ id: string; name: string }>) nameById.set(g.id, g.name)
  }

  const teachersByGroup = new Map<string, Set<string>>()
  {
    const { data } = await sb.from('class_teachers').select('class_group_id, teacher_id').in('class_group_id', allGroupIds)
    for (const r of (data ?? []) as Array<{ class_group_id: string; teacher_id: string }>) {
      const set = teachersByGroup.get(r.class_group_id) ?? new Set<string>()
      set.add(r.teacher_id); teachersByGroup.set(r.class_group_id, set)
    }
  }

  // Состав групп: class_enrollments → journey_id → education_journeys.person_id.
  // Сверяем по person_id (реальная ученица), а не по journey.
  const studentsByGroup = new Map<string, Set<string>>()
  {
    const { data } = await sb.from('class_enrollments').select('class_group_id, journey_id').in('class_group_id', allGroupIds)
    const rows = (data ?? []) as Array<{ class_group_id: string; journey_id: string }>
    const journeyIds = [...new Set(rows.map(r => r.journey_id).filter(Boolean))]
    const personByJourney = new Map<string, string>()
    if (journeyIds.length) {
      const { data: jr } = await sb.from('education_journeys').select('id, person_id').in('id', journeyIds)
      for (const j of (jr ?? []) as Array<{ id: string; person_id: string }>) personByJourney.set(j.id, j.person_id)
    }
    for (const r of rows) {
      const pid = personByJourney.get(r.journey_id)
      if (!pid) continue
      const set = studentsByGroup.get(r.class_group_id) ?? new Set<string>()
      set.add(pid); studentsByGroup.set(r.class_group_id, set)
    }
  }

  // Преподаватели КАНДИДАТА: если у слота задан свой — конфликт ищем только по
  // нему. Иначе (NULL) — по всем преподавателям группы, как раньше.
  const myTeachers = new Set(
    effectiveTeacherIds(cand.teacherId, [...(teachersByGroup.get(cand.classGroupId) ?? new Set<string>())]),
  )
  const myStudents = studentsByGroup.get(cand.classGroupId) ?? new Set<string>()
  const myRoom = normRoom(cand.room)

  const conflicts: SlotConflict[] = []
  const seen = new Set<string>()

  for (const s of others) {
    const gid = s.class_group_id
    const gname = nameById.get(gid) ?? '—'

    const roomMatchById = !!cand.roomId && !!s.room_id && s.room_id === cand.roomId
    const roomMatchByText = !!myRoom && normRoom(s.room) === myRoom
    if (roomMatchById || roomMatchByText) {
      const key = `${gid}:room`
      if (!seen.has(key)) { seen.add(key); conflicts.push({ kind: 'room', group_name: gname, detail: cand.room ?? undefined }) }
    }
    // И у встречного слота тоже действующий преподаватель, а не вся его группа:
    // иначе урок, отданный одному преподавателю, продолжал бы «занимать» всех
    // остальных преподавателей своей группы.
    const theirTeachers = new Set(
      effectiveTeacherIds(s.teacher_id, [...(teachersByGroup.get(gid) ?? new Set<string>())]),
    )
    if (theirTeachers.size > 0 && [...myTeachers].some(t => theirTeachers.has(t))) {
      const key = `${gid}:teacher`
      if (!seen.has(key)) { seen.add(key); conflicts.push({ kind: 'teacher', group_name: gname }) }
    }
    const theirStudents = studentsByGroup.get(gid)
    if (theirStudents && myStudents.size > 0) {
      const shared = [...myStudents].filter(st => theirStudents.has(st)).length
      if (shared > 0) {
        const key = `${gid}:students`
        if (!seen.has(key)) { seen.add(key); conflicts.push({ kind: 'students', group_name: gname, detail: String(shared) }) }
      }
    }
  }

  return conflicts
}
