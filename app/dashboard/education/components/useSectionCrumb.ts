'use client'

import { useTranslations } from '@/lib/i18n/LanguageContext'
import { EDUCATION_SECTION_ROUTES, type EducationSection } from '@/lib/education/education-hub'

const SECTION_TITLE_KEY: Record<EducationSection, string> = {
  recruitment: 'tabs.leads',
  admission: 'tabs.applicants',
  studies: 'tabs.students',
}

/**
 * Крошка раздела (גיוס / קבלה / לימודים) для экранов-инструментов, которые
 * открываются ИЗ раздела (отчёты набора, шибуц, מסלולים…). Без неё цепочка была
 * «ראשי › חינוך › экран», и единственный путь назад уводил на хаб «חינוך», а не
 * в раздел, откуда пришли. href можно уточнить (?sec=) — вернуть в нужную вкладку.
 */
export function useSectionCrumb(section: EducationSection, href?: string): { label: string; href: string } {
  const t = useTranslations('education')
  return { label: t(SECTION_TITLE_KEY[section]), href: href ?? EDUCATION_SECTION_ROUTES[section] }
}
