import type { createServerClient } from '@/lib/supabase/server'
import { notifyFinanceSemesterOpened } from '@/lib/finance/notify-semester-opened'

type SB = ReturnType<typeof createServerClient>

/** מחיר ברירת המחדל לסמסטר (₽) — ניתן לשינוי בעת היצירה ואחריה. */
export const DEFAULT_SEMESTER_PRICE = 210000

/**
 * Наименьший номер семестра (1, 2, 3 …), ещё не занятый у предмета.
 * null/нечисловые/<1 значения игнорируются. Чистая функция — покрыта тестом.
 */
export function nextMissingTerm(used: ReadonlyArray<number | null | undefined>): number {
  const taken = new Set<number>()
  for (const n of used) {
    if (typeof n === 'number' && Number.isInteger(n) && n >= 1) taken.add(n)
  }
  let term = 1
  while (taken.has(term)) term++
  return term
}

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

export interface CreateSubjectSemestersInput {
  subjectId: string
  /** Базовое имя семестра — на иврите (nameHe || name): «עיצוב · 1». */
  baseName: string
  departmentId: string
  studyTrackId: string
  yearLevel: number | null
  terms: number[]
  price: number
  /**
   * Проверять дубликат (маршрут + год + номер + предмет) перед вставкой.
   * Для только что созданного предмета не нужно: его семестры не могут
   * совпасть по subject_id.
   */
  checkDuplicate?: boolean
  /** body.force === true — создать несмотря на найденный дубликат. */
  force?: boolean
}

export interface CreateSubjectSemestersResult {
  /** Найден дубликат и force !== true — ничего не создано. */
  duplicate: { id: string; name: string } | null
  created: Array<{ id: string; term_number: number }>
  failed: number
}

/**
 * Создаёт семестры (class_groups с is_semester=true) для предмета — по одному
 * на каждый номер из `terms`. Общий код для POST /subjects (автосоздание 1/2)
 * и POST /subjects/[id]/semesters (добавить недостающий семестр).
 * После каждого созданного семестра уведомляет финансовый отдел (best-effort:
 * сбой уведомления не ломает запрос).
 */
export async function createSubjectSemesters(
  sb: SB,
  input: CreateSubjectSemestersInput,
): Promise<CreateSubjectSemestersResult> {
  const result: CreateSubjectSemestersResult = { duplicate: null, created: [], failed: 0 }

  if (input.checkDuplicate && !input.force) {
    for (const term of input.terms) {
      const dup = await findDuplicateSemester(sb, {
        studyTrackId: input.studyTrackId,
        yearLevel: input.yearLevel,
        termNumber: term,
        subjectId: input.subjectId,
      })
      if (dup) { result.duplicate = dup; return result }
    }
  }

  for (const term of input.terms) {
    const name = `${input.baseName} · ${term}`
    const semInsert: Record<string, unknown> = {
      name,
      department_id: input.departmentId,
      subject_id: input.subjectId,
      study_track_id: input.studyTrackId,
      year_level: input.yearLevel,
      is_semester: true,
      sem_status: 'open',
      term_number: term,
      tuition_amount: input.price,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sb.from('class_groups').insert(semInsert as any).select('id').single() as any)
    if (error || !data) { result.failed++; continue }
    const id = (data as { id: string }).id
    result.created.push({ id, term_number: term })

    // Уведомление финансам — как в POST /semester-groups. Best-effort:
    // любая ошибка проглатывается, семестр уже создан.
    try {
      await notifyFinanceSemesterOpened(sb, { classGroupId: id, name, yearLabel: null, termNumber: term })
    } catch {
      // игнорируем — уведомление не критично
    }
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
