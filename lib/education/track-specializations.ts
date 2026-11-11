import { isMissingTable } from '@/lib/supabase/errors'

// ─── מגמות בתוך מסלול (study_track_specializations) ───────────────────────────
// Пример: «אוניברסיטה» → כלכלה, פרסום (PR). Таблицы нет в сгенерированных
// типах — нетипизированный клиент. Деплой-безопасно: нет таблицы → пусто.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySB = any

export interface SpecializationRow {
  id: string
  track_id: string
  code: string
  name_he: string
  name_ru: string
  name_en: string
  sort_order: number
  is_active: boolean
}

export async function loadSpecializations(sb: AnySB, opts: { includeInactive?: boolean } = {}): Promise<SpecializationRow[]> {
  let q = sb.from('study_track_specializations')
    .select('id, track_id, code, name_he, name_ru, name_en, sort_order, is_active')
    .order('sort_order', { ascending: true })
  if (!opts.includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q
  if (error) {
    if (isMissingTable(error)) return []
    throw error
  }
  return (data ?? []) as SpecializationRow[]
}

/** Приклеить к каждому маршруту его מגמות: { ...track, specializations: [...] }. */
export function attachSpecializations<T extends { id: string }>(tracks: T[], specs: SpecializationRow[]): Array<T & { specializations: SpecializationRow[] }> {
  const by = new Map<string, SpecializationRow[]>()
  for (const s of specs) {
    const list = by.get(s.track_id) ?? []
    list.push(s)
    by.set(s.track_id, list)
  }
  return tracks.map(t => ({ ...t, specializations: by.get(t.id) ?? [] }))
}

/** מגמה принадлежит маршруту? null/undefined — «без מגמה», это допустимо. */
export async function specializationBelongsTo(sb: AnySB, specializationId: string | null | undefined, trackId: string): Promise<boolean> {
  if (!specializationId) return true
  const { data, error } = await sb.from('study_track_specializations')
    .select('id').eq('id', specializationId).eq('track_id', trackId).maybeSingle()
  if (error) return false
  return !!data
}
