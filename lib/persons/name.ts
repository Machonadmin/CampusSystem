/**
 * Отображаемое имя человека: ивритское имя, если задано, иначе «легальное»
 * (обычно русское) full_name. Раньше `hebrew_name || full_name` инлайнилось в
 * десятках мест — здесь единая точка (и естественный дом для будущей локали/RTL).
 */
export function personDisplayName(
  p: { hebrew_name?: string | null; full_name?: string | null } | null | undefined,
): string {
  if (!p) return ''
  return (p.hebrew_name || p.full_name || '').trim()
}

/**
 * Сравнение имён для списков людей — по алфавиту (решение владельца 2026-10-19:
 * «בכל מקום התלמידות אמורות להיות ממוינות … לפי הסדר»). Иврит, русский и латиница
 * — каждый по своему алфавиту; регистр и огласовки не важны. Сортировать нужно
 * по тому имени, которое список ПОКАЗЫВАЕТ первым.
 */
export function compareNames(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? '').trim().localeCompare((b ?? '').trim(), ['he', 'ru', 'en'], { sensitivity: 'base' })
}
