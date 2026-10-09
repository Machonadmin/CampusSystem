// ─── Названия процессов / этапов / исходов на языке пользователя ─────────────
//
// Источник названия (по порядку):
//   1. Переопределение в БД на языке интерфейса — name_he / name_en
//      (заполняется в редакторе «תבניות תהליכים»). Пусто = нет переопределения.
//   2. Стандартный перевод из словаря по КОДУ (education.process.*,
//      acceptance_finals.* — то, что видит персонал в карточке лида).
//   3. name_ru из БД — для этапов/исходов, созданных в редакторе, у которых
//      нет кода в словаре.
//
// Для русского интерфейса переопределения нет (name_ru — это внутреннее имя
// шаблона, и в нём движок пишет системные события), поэтому порядок 2 → 3.
//
// Одна функция на все экраны (редактор, блок процесса, граф): что админ видит
// в редакторе — то же видит персонал.
import type { Lang } from '@/lib/i18n/translations'
import { acceptanceFinalKey, isMedicalFinal } from '@/lib/i18n/acceptance-finals'

/** Переводчик неймспейса 'education'. */
export type TEdu = (key: string, fallback?: string) => string

export interface WorkflowNamed {
  code: string
  name_ru: string
  name_he?: string | null
  name_en?: string | null
}

/** Переопределение названия в БД на языке интерфейса (или null). */
export function workflowNameOverride(row: Pick<WorkflowNamed, 'name_he' | 'name_en'>, lang: Lang): string | null {
  const v = lang === 'he' ? row.name_he : lang === 'en' ? row.name_en : null
  return v && v.trim() ? v.trim() : null
}

export function processName(row: WorkflowNamed, lang: Lang, tEdu: TEdu): string {
  return workflowNameOverride(row, lang) ?? tEdu(`process.names.${row.code}`, row.name_ru)
}

export function stageName(row: WorkflowNamed, lang: Lang, tEdu: TEdu): string {
  return workflowNameOverride(row, lang) ?? tEdu(`process.stages.${row.code}`, row.name_ru)
}

/**
 * Название исхода этапа. Без переопределения — то же правило, что в карточке
 * лида (ProcessInfoBlock): мед./псих. заключение и проверка еврейства берут
 * подписи приёмной комиссии, остальные — общий словарь process.finals.
 */
export function finalName(stageCode: string | null | undefined, row: WorkflowNamed, lang: Lang, tEdu: TEdu): string {
  const override = workflowNameOverride(row, lang)
  if (override) return override
  const generic = tEdu(`process.finals.${row.code}`, row.name_ru)
  if (isMedicalFinal(stageCode, row.code)) return tEdu(acceptanceFinalKey(stageCode, row.code), generic)
  return stageCode === 'jewishness' ? tEdu(`acceptance_finals.${row.code}`, generic) : generic
}

/** Описание на языке интерфейса: description_he / description_en, иначе description (рус.). */
export function workflowDescription(
  row: { description: string | null; description_he?: string | null; description_en?: string | null },
  lang: Lang,
): string | null {
  const v = lang === 'he' ? row.description_he : lang === 'en' ? row.description_en : null
  return (v && v.trim()) || row.description || null
}
