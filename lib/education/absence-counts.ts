import { createServerClient } from '@/lib/supabase/server'
import {
  KODESH_DEPT_ID,
  loadKodeshExemptions,
  type KodeshExemptions,
} from '@/lib/education/kodesh-exceptions'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Единый источник истины для подсчёта пропусков (absent) и опозданий (late) по
 * journey за окно времени, С УЧЁТОМ חריגות קודש (освобождённой студентке
 * пропуск урока кодеша не засчитывается). Используется и управленческой доской
 * «в зоне риска» (app/api/education/at-risk), и ночным cron-порогом
 * (lib/education/absence-alerts). Раньше эта логика жила только в at-risk и при
 * добавлении cron грозила разъехаться — вынесена сюда.
 */

// PostgREST молча обрезает выдачу на db-max-rows (~1000); длинный .in() упирается
// в длину URL. Читаем чанками по фильтру + пагинацией внутри чанка.
const PAGE = 1000
const IN_CHUNK = 150

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filter = any

export async function fetchAllByIn<Row>(
  sb: SupabaseClient,
  table: string,
  selectCols: string,
  filterCol: string,
  ids: string[],
  orderCols: string[],
  extra?: (q: Filter) => Filter,
): Promise<Row[]> {
  const out: Row[] = []
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK)
    let from = 0
    for (;;) {
      let q: Filter = sb.from(table).select(selectCols).in(filterCol, chunk)
      if (extra) q = extra(q)
      for (const col of orderCols) q = q.order(col, { ascending: true })
      const { data, error } = await q.range(from, from + PAGE - 1)
      if (error) throw error
      const rows = (data ?? []) as unknown as Row[]
      out.push(...rows)
      if (rows.length < PAGE) break
      from += PAGE
    }
  }
  return out
}

export interface AbsenceCount { absent: number; late: number }

export interface AttRow { lesson_id: string; journey_id: string | null; status: string | null }

/**
 * ЧИСТАЯ агрегация: по строкам посещаемости (absent/late), информации об уроках
 * и контексту кодеша считает absent/late на journey. Освобождённые пропуски
 * кодеша не учитываются. Вынесена ради юнит-тестов (без БД).
 */
export function aggregateAbsenceCounts(params: {
  attRows: AttRow[]
  lessonInfo: Map<string, { gid: string; date: string }>
  kodeshGroupIds: Set<string>
  exemptions: KodeshExemptions | null
}): Map<string, AbsenceCount> {
  const { attRows, lessonInfo, kodeshGroupIds, exemptions } = params
  const acc = new Map<string, AbsenceCount>()
  for (const r of attRows) {
    if (!r.journey_id) continue
    const info = lessonInfo.get(r.lesson_id)
    // Освобождённый пропуск урока кодеша — не считаем.
    if (info && exemptions?.hasAny && kodeshGroupIds.has(info.gid) && exemptions.isExempt(r.journey_id, info.date)) {
      continue
    }
    if (r.status !== 'absent' && r.status !== 'late') continue
    const cur = acc.get(r.journey_id) ?? { absent: 0, late: 0 }
    if (r.status === 'absent') cur.absent += 1
    else cur.late += 1
    acc.set(r.journey_id, cur)
  }
  return acc
}

/**
 * IO-обёртка: грузит уроки (не отменённые, за окно) → посещаемость (absent/late)
 * → חריגות קודש → агрегирует. deptIds=null — по всему институту; иначе — только
 * группы этих подразделений. Возвращает Map journey→{absent,late}. Deploy-safe к
 * отсутствию таблиц отдаётся вызывающему (пробрасывает 42P01).
 */
export async function loadAbsenceCounts(
  sb: ReturnType<typeof createServerClient>,
  opts: { cutoff: string; deptIds: string[] | null },
): Promise<Map<string, AbsenceCount>> {
  // 1. Учебные группы в зоне видимости.
  let gq = sb.from('class_groups').select('id, department_id')
  if (opts.deptIds) gq = gq.in('department_id', opts.deptIds)
  const { data: groupsRaw, error: gErr } = await gq
  if (gErr) throw gErr
  const groups = (groupsRaw ?? []) as Array<{ id: string; department_id: string | null }>
  const groupIds = groups.map(g => g.id)
  if (groupIds.length === 0) return new Map()

  const kodeshGroupIds = new Set(groups.filter(g => g.department_id === KODESH_DEPT_ID).map(g => g.id))

  // 2. Уроки этих групп: не отменённые, за период.
  const lessonRows = await fetchAllByIn<{ id: string; class_group_id: string; scheduled_date: string }>(
    sb, 'lessons', 'id, class_group_id, scheduled_date', 'class_group_id', groupIds, ['id'],
    q => q.eq('is_cancelled', false).gte('scheduled_date', opts.cutoff),
  )
  const lessonInfo = new Map<string, { gid: string; date: string }>()
  for (const l of lessonRows) lessonInfo.set(l.id, { gid: l.class_group_id, date: l.scheduled_date })
  const lessonIds = lessonRows.map(l => l.id)
  if (lessonIds.length === 0) return new Map()

  // 3. Посещаемость: только absent/late.
  const attRows = await fetchAllByIn<AttRow & { id: string }>(
    sb, 'attendance', 'id, lesson_id, journey_id, status', 'lesson_id', lessonIds, ['id'],
    q => q.in('status', ['absent', 'late']),
  )

  // חריגות קודש — грузим только для тех, у кого есть отметки на уроках кодеша.
  let exemptions: KodeshExemptions | null = null
  if (kodeshGroupIds.size > 0) {
    const kodeshJourneyIds = [...new Set(attRows
      .filter(r => { const i = lessonInfo.get(r.lesson_id); return !!i && kodeshGroupIds.has(i.gid) })
      .map(r => r.journey_id).filter(Boolean))] as string[]
    if (kodeshJourneyIds.length > 0) exemptions = await loadKodeshExemptions(sb, kodeshJourneyIds)
  }

  return aggregateAbsenceCounts({ attRows, lessonInfo, kodeshGroupIds, exemptions })
}
