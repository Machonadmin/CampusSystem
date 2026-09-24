// Отображение «года-ступени» (year_level 1..4) в учёбе.
// На иврите — буквами א/ב/ג/ד (как принято в кампусе); иначе — числом.

const HE_LETTERS = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו']

/**
 * Короткая метка года: he → буква (א/ב/ג), прочие языки → число.
 * `||`, а НЕ `??`: HE_LETTERS[0] — пустая строка (заполнитель, чтобы индекс
 * совпадал с номером года), и с `??` год 0 отрисовался бы пустым местом.
 */
export function yearLevelLabel(level: number | null | undefined, lang: string): string {
  if (level == null) return '—'
  if (lang === 'he') return HE_LETTERS[level] || String(level)
  return String(level)
}

/** «שנה א» / «Year 2» — с префиксом-словом для заголовков. */
export function yearLevelTitle(level: number | null | undefined, lang: string): string {
  if (level == null) return lang === 'he' ? 'ללא שנה' : lang === 'ru' ? 'Без года' : 'No year'
  const l = yearLevelLabel(level, lang)
  return lang === 'he' ? `שנה ${l}` : lang === 'ru' ? `Год ${l}` : `Year ${l}`
}
