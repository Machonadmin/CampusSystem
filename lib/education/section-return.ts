/**
 * «Вернуться туда, где был» для крошки раздела (גיוס / קבלה / לימודים).
 * Раздел хранит позицию в URL (?sec=, ?struct=, ?sem= …). SectionShell запоминает
 * последний адрес раздела в sessionStorage, а крошка раздела на экранах-инструментах
 * (מערכת שעות, מורים, היעדרויות…) ведёт именно туда, а не в начало раздела
 * (просьба владельца 2026-11-10: из «לוח בקרה» → экран → «לימודים» должен
 * вернуть в «לוח בקרה», а не в начало учёбы).
 *
 * Чистые функции + тонкие обёртки над хранилищем. Сохраняем ТОЛЬКО адреса
 * внутри маршрута самого раздела — никакого открытого редиректа.
 */
import { EDUCATION_SECTION_ROUTES, type EducationSection } from './education-hub'

const KEY_PREFIX = 'edu-section-return:'

export function sectionReturnKey(section: EducationSection): string {
  return KEY_PREFIX + section
}

/** Адрес допустим, только если это маршрут раздела (с query или без). */
export function isValidSectionReturn(section: EducationSection, url: string | null | undefined): url is string {
  if (typeof url !== 'string') return false
  const base = EDUCATION_SECTION_ROUTES[section]
  return url === base || url.startsWith(base + '?')
}

/** Куда вести крошку: запомненный адрес, иначе fallback. */
export function resolveSectionReturn(
  section: EducationSection,
  stored: string | null | undefined,
  fallback: string,
): string {
  return isValidSectionReturn(section, stored) ? stored : fallback
}

export function saveSectionReturn(section: EducationSection, url: string): void {
  if (!isValidSectionReturn(section, url)) return
  try { window.sessionStorage.setItem(sectionReturnKey(section), url) } catch { /* нет хранилища */ }
}

export function readSectionReturn(section: EducationSection): string | null {
  try { return window.sessionStorage.getItem(sectionReturnKey(section)) } catch { return null }
}
