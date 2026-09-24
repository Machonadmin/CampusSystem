/**
 * Навигация «Учёбы» ↔ URL. Состояние drill-down (раздел рельса + маршрут → год →
 * набор → семестр) держим в query-параметрах, чтобы КАЖДЫЙ шаг создавал запись
 * истории (router.push) — тогда браузерный «назад» шагает по уровням, а deep-link
 * и обновление страницы восстанавливают ту же позицию. Чистые функции без React/DOM
 * — их легко тестировать.
 *
 * Параметры (не пересекаются между собой):
 *   sec    — раздел рельса StudyTab: dashboard | actions | semester_groups | students | settings
 *   struct — маршрут (study_track id) или '__none__' (без маршрута)
 *   ylevel — год ('none' | положительное целое)
 *   cohort — набор (year_label; 'none' = без года)
 *   sem    — открытый семестр ИЛИ уровень кодеша (class_group id)
 */

export type StudySection = 'dashboard' | 'actions' | 'semester_groups' | 'students' | 'settings'

export const STUDY_SECTIONS: readonly StudySection[] = [
  'dashboard', 'actions', 'semester_groups', 'students', 'settings',
]

/** Раздел рельса из ?sec= (неизвестное/пустое → 'dashboard'). */
export function parseStudySection(raw: string | null | undefined): StudySection {
  return raw != null && (STUDY_SECTIONS as readonly string[]).includes(raw)
    ? (raw as StudySection)
    : 'dashboard'
}

export type YearLevel = number | 'none'

export interface StudiesNav {
  structId: string | null
  yearLevel: YearLevel | null
  cohort: string | null // 'none' — набор без year_label (сохраняется как есть)
  sem: string | null     // открытый семестр / уровень кодеша
}

/** Ключи drill-навигации «Учёбы» (для очистки при смене раздела рельса). */
export const STUDIES_NAV_KEYS = ['struct', 'ylevel', 'cohort', 'sem'] as const

/**
 * Разбор drill-состояния из query. Иерархия НОРМАЛИЗУЕТСЯ: cohort требует
 * yearLevel, yearLevel требует structId. sem независим (уровень кодеша
 * открывается с верхнего уровня, без маршрута).
 */
export function parseStudiesNav(get: (key: string) => string | null | undefined): StudiesNav {
  const structRaw = get('struct')
  const structId = structRaw != null && structRaw.length > 0 ? structRaw : null

  let yearLevel: YearLevel | null = null
  if (structId != null) {
    const yl = get('ylevel')
    if (yl === 'none') yearLevel = 'none'
    else if (yl != null && yl.length > 0) {
      const n = Number(yl)
      if (Number.isInteger(n) && n > 0) yearLevel = n
    }
  }

  let cohort: string | null = null
  if (yearLevel != null) {
    const co = get('cohort')
    if (co != null && co.length > 0) cohort = co
  }

  const semRaw = get('sem')
  const sem = semRaw != null && semRaw.length > 0 ? semRaw : null

  return { structId, yearLevel, cohort, sem }
}

function setOrDelete(params: URLSearchParams, key: string, value: string | null): void {
  if (value == null || value.length === 0) params.delete(key)
  else params.set(key, value)
}

/**
 * Применяет drill-состояние к КОПИИ базовых query-параметров (прочие параметры,
 * напр. sec, сохраняются). Иерархия нормализуется так же, как в parse.
 */
export function applyStudiesNav(base: URLSearchParams, nav: StudiesNav): URLSearchParams {
  const params = new URLSearchParams(base.toString())
  const structId = nav.structId
  const yearLevel = structId != null ? nav.yearLevel : null
  const cohort = yearLevel != null ? nav.cohort : null
  setOrDelete(params, 'struct', structId)
  setOrDelete(params, 'ylevel', yearLevel == null ? null : String(yearLevel))
  setOrDelete(params, 'cohort', cohort)
  setOrDelete(params, 'sem', nav.sem)
  return params
}
