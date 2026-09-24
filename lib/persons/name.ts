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
