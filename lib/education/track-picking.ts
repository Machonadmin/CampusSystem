/**
 * «המסלול שלי»: чистая логика — как ответственный маршрута добавляет/снимает
 * студентку (без БД, чтобы покрыть тестами).
 *
 * Правила (согласовано с владельцем 2026-11-10):
 *   • у студентки не больше двух светских маршрутов: главный (primary) и
 *     дополнительный (additional);
 *   • пара допустима только טורו ↔ אוניברסיטה (любой университетский маршрут:
 *     code 'university', 'univ_*' или category 'university'), в любую сторону;
 *   • ответственный не может «забрать» студентку из чужого маршрута — получает
 *     «уже в маршруте X»;
 *   • לימודי קודש сюда не входят (это не study_tracks).
 */

export type TrackRole = 'primary' | 'additional'

export interface TrackLite {
  id: string
  code: string
  category?: string | null
}

export interface StudentTrackRow {
  track_id: string
  role: TrackRole
  /** מגמה внутри маршрута (напр. אוניברסיטה → כלכלה); null — не выбрана. */
  specialization_id?: string | null
}

export function isTouroTrack(t: TrackLite): boolean {
  return t.code === 'touro'
}

export function isUniversityTrack(t: TrackLite): boolean {
  return t.code === 'university' || t.code.startsWith('univ_') || t.category === 'university'
}

/** Можно ли держать два маршрута вместе (главный + дополнительный). */
export function canPairTracks(a: TrackLite, b: TrackLite): boolean {
  return (isTouroTrack(a) && isUniversityTrack(b)) || (isUniversityTrack(a) && isTouroTrack(b))
}

export type AddPlan =
  | { kind: 'add'; role: TrackRole }
  | { kind: 'already' }
  | { kind: 'blocked'; reason: 'other_track' | 'two_tracks'; trackIds: string[] }

/**
 * Что будет, если ответственный маршрута `target` добавит студентку с текущими
 * (активными) маршрутами `rows`. `catalog` — справочник, чтобы знать коды.
 */
export function planAddToTrack(target: TrackLite, rows: StudentTrackRow[], catalog: Map<string, TrackLite>): AddPlan {
  if (rows.some(r => r.track_id === target.id)) return { kind: 'already' }
  if (rows.length === 0) return { kind: 'add', role: 'primary' }
  if (rows.length >= 2) return { kind: 'blocked', reason: 'two_tracks', trackIds: rows.map(r => r.track_id) }
  const only = rows[0]
  const other = catalog.get(only.track_id)
  if (!other || !canPairTracks(target, other)) {
    return { kind: 'blocked', reason: 'other_track', trackIds: [only.track_id] }
  }
  return { kind: 'add', role: only.role === 'primary' ? 'additional' : 'primary' }
}

export type RemovePlan =
  | { kind: 'not_in_track' }
  | { kind: 'remove'; promoteTrackId: string | null }

/**
 * Снять студентку с маршрута `targetId`. Если снимается главный, а остался
 * дополнительный — он становится главным (студентка не остаётся без главного).
 */
export function planRemoveFromTrack(targetId: string, rows: StudentTrackRow[]): RemovePlan {
  const mine = rows.find(r => r.track_id === targetId)
  if (!mine) return { kind: 'not_in_track' }
  if (mine.role !== 'primary') return { kind: 'remove', promoteTrackId: null }
  const rest = rows.find(r => r.track_id !== targetId && r.role === 'additional')
  return { kind: 'remove', promoteTrackId: rest ? rest.track_id : null }
}
