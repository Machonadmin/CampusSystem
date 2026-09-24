import type { createServerClient } from '@/lib/supabase/server'
import { notifyFinanceSemesterOpened } from '@/lib/finance/notify-semester-opened'
import { isMissingRelation } from '@/lib/supabase/errors'
import { yearLevelTitle } from '@/lib/education/year-level'

type SB = ReturnType<typeof createServerClient>

/** מחיר ברירת המחדל לסמסטר (₽) — ניתן לשינוי בעת היצירה ואחריה. */
export const DEFAULT_SEMESTER_PRICE = 210000

/**
 * Цена для нового семестра предмета: явно присланная (≥ 0) → цена
 * существующего семестра предмета (первая непустая по возрастанию номера) →
 * DEFAULT_SEMESTER_PRICE. Чистая функция — покрыта тестом.
 */
export function pickSemesterPrice(
  requested: unknown,
  existing: ReadonlyArray<{ term_number: number | null; tuition_amount: number | null }>,
): number {
  if (typeof requested === 'number' && Number.isFinite(requested) && requested >= 0) return requested
  const sorted = [...existing].sort((a, b) => (a.term_number ?? Infinity) - (b.term_number ?? Infinity))
  const found = sorted.find(r => typeof r.tuition_amount === 'number')
  return found?.tuition_amount ?? DEFAULT_SEMESTER_PRICE
}

export interface SemesterKey {
  studyTrackId: string | null | undefined
  yearLevel: number | null | undefined
  termNumber: number | null | undefined
  /** Если задан — дубликатом считается только семестр того же предмета. */
  subjectId?: string | null
  /** PATCH: исключить сам редактируемый семестр. */
  excludeId?: string | null
}

/**
 * Ищет существующий семестр (class_groups.is_semester) с тем же маршрутом +
 * годом + номером семестра (и тем же предметом, если он задан).
 * Проверка выполняется, только когда заданы все три поля (маршрут, год, номер):
 * без одного из них «тот же семестр» не определён.
 * Деплой-безопасно и best-effort: при любой ошибке запроса (нет колонки и т.п.)
 * возвращает null — проверка на дубликат не должна ломать сохранение.
 */
export async function findDuplicateSemester(
  sb: SB,
  key: SemesterKey,
): Promise<{ id: string; name: string } | null> {
  if (!key.studyTrackId || key.yearLevel == null || key.termNumber == null) return null
  try {
    let qb = sb
      .from('class_groups')
      .select('id, name')
      .eq('is_semester', true)
      .eq('study_track_id', key.studyTrackId)
      .eq('year_level', key.yearLevel)
      .eq('term_number', key.termNumber)
    if (key.subjectId) qb = qb.eq('subject_id', key.subjectId)
    if (key.excludeId) qb = qb.neq('id', key.excludeId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (qb.limit(1) as any)
    if (error) return null
    const row = ((data ?? []) as Array<{ id: string; name: string }>)[0]
    return row ? { id: row.id, name: row.name } : null
  } catch {
    return null
  }
}

/**
 * Имя нового семестра-контейнера (на иврите — система ивритоцентрична):
 * «<маршрут> · שנה א · סמסטר 1». Имя маршрута — name_he, иначе переданный
 * запасной вариант. Чистая функция — покрыта тестом.
 */
export function buildContainerSemesterName(
  trackName: string | null | undefined,
  yearLevel: number | null | undefined,
  term: number,
): string {
  const parts = [trackName?.trim() || null, yearLevelTitle(yearLevel, 'he'), `סמסטר ${term}`]
  return parts.filter(Boolean).join(' · ')
}

export interface ContainerCandidate {
  id: string
  created_at?: string | null
}

/**
 * Если найдено несколько семестров-контейнеров с тем же маршрутом + годом +
 * номером — берём самый старый: по created_at (по возрастанию), при равенстве
 * или отсутствии created_at — по id. Строки без created_at идут после строк
 * с датой. Чистая функция — покрыта тестом.
 */
export function pickOldestContainer<T extends ContainerCandidate>(rows: ReadonlyArray<T>): T | null {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : NaN
    const tb = b.created_at ? Date.parse(b.created_at) : NaN
    const ha = !Number.isNaN(ta)
    const hb = !Number.isNaN(tb)
    if (ha && hb && ta !== tb) return ta - tb
    if (ha !== hb) return ha ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return sorted[0]
}

export interface EnsureSubjectInTrackSemestersInput {
  subject: { id: string; name: string; name_he: string | null }
  track: {
    id: string
    department_id: string | null
    name_he?: string | null
    name_ru?: string | null
    name_en?: string | null
    code?: string | null
  }
  yearLevel: number | null
  /** Цена ТОЛЬКО для вновь создаваемого семестра; существующие не меняются. */
  price: number
}

export interface EnsureSubjectInTrackSemestersResult {
  /** У маршрута нет подразделения — ничего не создано. */
  noDepartment: boolean
  /** Нет нужных колонок (миграция не применена) — ничего не создано. */
  notMigrated: boolean
  /** Семестры по номерам: созданные (created=true) или найденные (created=false). */
  semesters: Array<{ term_number: number; id: string; name: string; created: boolean }>
  /** Добавленные курсы предмета (по одному на семестр, где его не было). */
  coursesAdded: Array<{ term_number: number; semester_id: string; course_id: string }>
  /** Число номеров, где что-то не удалось вставить. */
  failed: number
}

/**
 * Решение владельца (2026-09-24): один семестр содержит несколько предметов.
 * Для маршрута + года есть семестр 1 и семестр 2 (class_groups: is_semester=true,
 * subject_id IS NULL). Предмет добавляется в каждый из них КУРСОМ
 * (class_groups: is_semester=false, parent_semester_id = семестр, subject_id =
 * предмет) — те же поля, что в POST /semester-groups/[id]/courses.
 *
 * Для каждого номера из `terms`:
 *   a. ищем существующий семестр-контейнер (самый старый, если их несколько);
 *   b. если нет — создаём его (цена = input.price) и уведомляем финансы;
 *   c. если у предмета уже есть курс в этом семестре — пропускаем, иначе создаём.
 * Старые семестры «по предмету» (subject_id задан) не трогаются.
 * Права проверяет вызывающий маршрут.
 */
export async function ensureSubjectInTrackSemesters(
  sb: SB,
  input: EnsureSubjectInTrackSemestersInput,
  terms: number[] = [1, 2],
): Promise<EnsureSubjectInTrackSemestersResult> {
  const result: EnsureSubjectInTrackSemestersResult = {
    noDepartment: false, notMigrated: false, semesters: [], coursesAdded: [], failed: 0,
  }
  const departmentId = input.track.department_id
  if (!departmentId) { result.noDepartment = true; return result }

  const trackName = input.track.name_he || input.track.name_ru || input.track.name_en || input.track.code || null
  const courseName = input.subject.name_he || input.subject.name

  for (const term of terms) {
    // a. Существующий семестр-контейнер маршрута + года + номера.
    let qb = sb
      .from('class_groups')
      .select('id, name, created_at')
      .eq('is_semester', true)
      .is('subject_id', null)
      .eq('study_track_id', input.track.id)
      .eq('term_number', term)
    qb = input.yearLevel == null ? qb.is('year_level', null) : qb.eq('year_level', input.yearLevel)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = await (qb as any)
    if (found.error) {
      if (isMissingRelation(found.error)) { result.notMigrated = true; return result }
      throw found.error
    }
    const existing = pickOldestContainer((found.data ?? []) as Array<{ id: string; name: string; created_at: string | null }>)

    let semesterId: string
    if (existing) {
      semesterId = existing.id
      result.semesters.push({ term_number: term, id: existing.id, name: existing.name, created: false })
    } else {
      // b. Создаём семестр-контейнер (subject_id = NULL).
      const name = buildContainerSemesterName(trackName, input.yearLevel, term)
      const semInsert: Record<string, unknown> = {
        name,
        department_id: departmentId,
        subject_id: null,
        study_track_id: input.track.id,
        year_level: input.yearLevel,
        is_semester: true,
        sem_status: 'open',
        term_number: term,
        tuition_amount: input.price,
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ins = await (sb.from('class_groups').insert(semInsert as any).select('id').single() as any)
      if (ins.error || !ins.data) {
        if (ins.error && isMissingRelation(ins.error)) { result.notMigrated = true; return result }
        result.failed++
        continue
      }
      semesterId = (ins.data as { id: string }).id
      result.semesters.push({ term_number: term, id: semesterId, name, created: true })

      // Уведомление финансам — как в POST /semester-groups. Best-effort:
      // любая ошибка проглатывается, семестр уже создан.
      try {
        await notifyFinanceSemesterOpened(sb, { classGroupId: semesterId, name, yearLabel: null, termNumber: term })
      } catch {
        // игнорируем — уведомление не критично
      }
    }

    // c. Курс предмета в этом семестре уже есть? Тогда пропускаем.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const has = await (sb
      .from('class_groups')
      .select('id')
      .eq('is_semester', false)
      .eq('parent_semester_id', semesterId)
      .eq('subject_id', input.subject.id)
      .limit(1) as any)
    if (has.error) {
      if (isMissingRelation(has.error)) { result.notMigrated = true; return result }
      throw has.error
    }
    if (((has.data ?? []) as unknown[]).length > 0) continue

    // Те же поля, что в POST /semester-groups/[id]/courses.
    const courseInsert: Record<string, unknown> = {
      name: courseName,
      department_id: departmentId,
      subject_id: input.subject.id,
      is_semester: false,
      parent_semester_id: semesterId,
      is_active: true,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cIns = await (sb.from('class_groups').insert(courseInsert as any).select('id').single() as any)
    if (cIns.error || !cIns.data) {
      if (cIns.error && isMissingRelation(cIns.error)) { result.notMigrated = true; return result }
      result.failed++
      continue
    }
    result.coursesAdded.push({ term_number: term, semester_id: semesterId, course_id: (cIns.data as { id: string }).id })
  }
  return result
}

/** Нормализация имени для сравнения: trim + нижний регистр. */
function normName(s: string | null | undefined): string {
  return (s ?? '').trim().toLocaleLowerCase()
}

/**
 * Занято ли имя предмета: совпадает ли любое из `candidates` с name_he или
 * name любой из строк (без учёта регистра и крайних пробелов). Чистая функция.
 */
export function isSubjectNameTaken(
  rows: ReadonlyArray<{ name: string | null; name_he: string | null }>,
  candidates: ReadonlyArray<string | null | undefined>,
): boolean {
  const wanted = new Set(candidates.map(normName).filter(Boolean))
  if (wanted.size === 0) return false
  return rows.some(r => wanted.has(normName(r.name_he)) || wanted.has(normName(r.name)))
}
