/**
 * Хаб «חינוך» (/dashboard/education). Раньше страница ВСЕГДА редиректила по
 * приоритету прав (набор → приём → учёба → главная), поэтому хлебная крошка
 * «חינוך» уводила пользователя учёбы, у которого есть и view_applicants, на приём
 * — сюрприз. Теперь: если доступен ровно ОДИН раздел — уводим сразу в него; если
 * два и больше — показываем стабильный хаб с карточками только доступных
 * разделов; если ноль — fail-closed на главную. Решение вынесено в чистую функцию.
 */

export type EducationSection = 'recruitment' | 'admission' | 'studies'

export const EDUCATION_SECTION_ROUTES: Record<EducationSection, string> = {
  recruitment: '/dashboard/education/recruitment',
  admission: '/dashboard/education/admission',
  studies: '/dashboard/education/studies',
}

// Стабильный порядок карточек + приоритет одиночного авто-перехода.
export const EDUCATION_SECTION_ORDER: readonly EducationSection[] = [
  'recruitment', 'admission', 'studies',
]

export interface AccessibleSections {
  recruitment: boolean
  admission: boolean
  studies: boolean
}

export type HubTarget =
  | { kind: 'redirect'; href: string }
  | { kind: 'hub'; sections: EducationSection[] }

/**
 * По набору доступных разделов решает поведение хаба:
 *   0 доступных → нет образовательного доступа → на главную (fail-closed);
 *   1 доступный → минуем хаб, ведём прямо в раздел;
 *   2+ → показываем хаб с карточками доступных разделов (стабильный порядок).
 */
export function resolveEducationHubTarget(accessible: AccessibleSections): HubTarget {
  const sections = EDUCATION_SECTION_ORDER.filter(s => accessible[s])
  if (sections.length === 0) return { kind: 'redirect', href: '/dashboard' }
  if (sections.length === 1) return { kind: 'redirect', href: EDUCATION_SECTION_ROUTES[sections[0]] }
  return { kind: 'hub', sections }
}
