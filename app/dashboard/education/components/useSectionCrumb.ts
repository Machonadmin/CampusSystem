'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { EDUCATION_SECTION_ROUTES, type EducationSection } from '@/lib/education/education-hub'
import { readSectionReturn, resolveSectionReturn } from '@/lib/education/section-return'

export const SECTION_TITLE_KEY: Record<EducationSection, string> = {
  recruitment: 'tabs.leads',
  admission: 'tabs.applicants',
  studies: 'tabs.students',
}

/**
 * Крошка раздела (גיוס / קבלה / לימודים) для экранов, которые открываются ИЗ
 * раздела. Цепочка «ראשי › לימודים › экран» — без скрытого хаба «חינוך»
 * (его нет в меню, и переход туда выглядел как «попал непонятно куда»).
 *
 * href — ПОСЛЕДНЕЕ место внутри раздела (вкладка/маршрут/семестр), которое
 * запомнил SectionShell; если ничего не запомнено — `href` из аргумента, иначе
 * начало раздела. Читаем хранилище после монтирования (без расхождения с SSR).
 */
export function useSectionCrumb(section: EducationSection, href?: string): { label: string; href: string } {
  const t = useTranslations('education')
  const fallback = href ?? EDUCATION_SECTION_ROUTES[section]
  const [target, setTarget] = useState(fallback)
  useEffect(() => {
    setTarget(resolveSectionReturn(section, readSectionReturn(section), fallback))
  }, [section, fallback])
  return { label: t(SECTION_TITLE_KEY[section]), href: target }
}
