/** Данные плана этажа: результат scripts/floor-map/scan_to_rooms.py + regularize.py. */

export type RoomIssue = 'no_number' | 'area_mismatch'

export interface RoomNames {
  ru: string | null
  he: string | null
  en: string | null
}

export interface Room {
  /** Стабильный идентификатор помещения на этаже, например "f1-25а". */
  id: string
  /** Номер по плану БТИ. Null у помещений, подпись которых не найдена. */
  bti_number: string | null
  floor: string
  /** Полигон в метрах, начало координат — левый верхний угол контура здания. */
  polygon_m: [number, number][]
  centroid_m: [number, number]
  area_computed_m2: number
  /** Площадь, напечатанная на плане БТИ; null если подпись не прочитана. */
  area_printed_m2: number | null
  area_delta_pct: number | null
  /** Название из официального списка. Заполняется при привязке к номерам БТИ. */
  name: RoomNames
  /** Номер помещения в нумерации университета (101, 202 и т. д.). */
  university_number: string | null
  issues: RoomIssue[]
}

export interface FloorPlan {
  floor: string
  source: string
  scale: string
  px_per_meter: number
  /** Габарит этажа в метрах: [ширина, высота] — он же viewBox карты. */
  extent_m: [number, number]
  footprint_m2: number
  footprint_polygon_m: [number, number][]
  rooms: Room[]
}
