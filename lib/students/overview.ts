// ─── Student 360 «Обзор» — чистая логика + типы ──────────────────────────────
//
// Консолидированный обзор одного студента (journey), собирающий данные из всех
// модулей. Каждая секция показывается ТОЛЬКО если у смотрящего есть привилегия
// 'view' соответствующего модуля. Это только-чтение; новых таблиц/миграций нет.
//
// В этом файле — исключительно чистые функции и типы (без обращений к БД),
// поэтому ключевая логика (какие секции видны, выбор ТЕКУЩЕЙ активной записи,
// нормализация телефонов, наличие аллергий) покрывается юнит-тестами. Расчёт
// «активно на дату» переиспользует isActiveOn из lib/dormitory/occupancy и
// lib/food/enrollment — здесь его не дублируем.

// ─── Форма ответа /api/students/[id]/overview ─────────────────────────────────

export interface OverviewPerson {
  full_name: string
  hebrew_name: string | null
  email: string | null
  phones: string[]
  photo_url: string | null
}

export interface OverviewEducation {
  status: string | null
  department: string | null
  specialty: string | null
  opened_at: string | null
}

/** Финансы: суммы в валютных единицах с двумя знаками (Σ active − Σ approved). */
export interface OverviewFinance {
  charged: number
  collected: number
  outstanding: number
}

export interface OverviewDormitory {
  building: string | null
  room: string | null
  since: string | null
}

export interface OverviewFood {
  plan_name: string | null
  since: string | null
}

export interface OverviewMedical {
  open_visits: number
  last_visit_date: string | null
  has_allergies: boolean
}

export interface OverviewCounseling {
  open_sessions: number
  risk_level: string | null
}

/** Документы: сколько всего активных, из них истекает скоро и просрочено. */
export interface OverviewDocuments {
  total: number
  expiring_soon: number
  expired: number
}

export interface StudentOverview {
  person: OverviewPerson
  education: OverviewEducation
  finance: OverviewFinance | null
  dormitory: OverviewDormitory | null
  food: OverviewFood | null
  medical: OverviewMedical | null
  counseling: OverviewCounseling | null
  documents: OverviewDocuments | null
  /** Секции, которые смотрящему в принципе разрешено видеть (по привилегиям). */
  visible_sections: string[]
}

// ─── Видимые секции по привилегиям ────────────────────────────────────────────

/** Привилегии 'view' смотрящего по каждому чувствительному модулю. */
export interface OverviewPerms {
  finance: boolean
  dormitory: boolean
  food: boolean
  doctor: boolean
  psychologist: boolean
  documents: boolean
}

/**
 * Порядок и имена секций в ответе. doctor → 'medical', psychologist →
 * 'counseling' (имена секций, а не модулей). Education/person всегда видны
 * (гейт верхнего уровня — education view_students), поэтому здесь их нет.
 */
const SECTION_BY_PERM: { perm: keyof OverviewPerms; section: string }[] = [
  { perm: 'finance',      section: 'finance' },
  { perm: 'dormitory',    section: 'dormitory' },
  { perm: 'food',         section: 'food' },
  { perm: 'doctor',       section: 'medical' },
  { perm: 'psychologist', section: 'counseling' },
  { perm: 'documents',    section: 'documents' },
]

/**
 * Какие секции смотрящий МОЖЕТ видеть — по его привилегиям, независимо от
 * наличия данных. Секция в ответе будет null, если данных нет ИЛИ привилегии
 * нет; visible_sections же отражает именно право доступа.
 */
export function visibleSections(perms: OverviewPerms): string[] {
  return SECTION_BY_PERM.filter(x => perms[x.perm]).map(x => x.section)
}

// ─── Выбор ТЕКУЩЕЙ активной записи ────────────────────────────────────────────

/**
 * Из списка записей выбирает текущую активную: подходящую по предикату isActive
 * (обычно isActiveOn(record, today) из соответствующего модуля) с самой поздней
 * датой начала. Если активных нет — null. Даты — ISO 'YYYY-MM-DD', сравниваются
 * лексикографически (для этого формата совпадает с хронологией).
 */
export function pickCurrentActive<T>(
  records: readonly T[],
  isActive: (r: T) => boolean,
  startOf: (r: T) => string,
): T | null {
  let best: T | null = null
  for (const r of records) {
    if (!isActive(r)) continue
    if (best === null || startOf(r) > startOf(best)) best = r
  }
  return best
}

// ─── Нормализация полей персоны ───────────────────────────────────────────────

/**
 * Json-поле phones → плоский массив непустых строк. Элемент может быть строкой
 * или объектом { number }. Идентично flattenPhones карточки студента.
 */
export function flattenPhones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(p => (typeof p === 'string' ? p : (p as { number?: string })?.number ?? ''))
    .filter(Boolean)
}

/** Есть ли у студента аллергии — по непустому текстовому полю медкарты. */
export function hasAllergies(allergies: string | null | undefined): boolean {
  return typeof allergies === 'string' && allergies.trim().length > 0
}
