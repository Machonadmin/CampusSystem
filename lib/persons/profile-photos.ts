// ─── «תמונת פרופיל» в кружке у имени ─────────────────────────────────────────
//
// Фото — обычный документ вида 'photo' (document_records), его загружает
// секретариат. В кружке показываем последнее АКТИВНОЕ фото человека по всем его
// учебным путям (education_journeys). Видит его только тот, у кого есть право
// persons.view_photos (superadmin проходит всегда) — проверка в
// app/api/persons/photos. persons.photo_url тут сознательно не трогаем: его
// отдают другим модулям без этого права.
//
// Здесь — чистая часть (её берёт и клиент, lib/hooks/usePersonPhotos.ts);
// чтение из БД и подписанные ссылки — в profile-photos-storage.ts.

export const PHOTO_DOC_TYPE = 'photo'

/** Только картинки: PDF под видом «תמונת פרופיל» в кружок не попадёт. */
export const PHOTO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/** Сколько людей за один запрос (список догружает страницы по 200 — клиент делит). */
export const MAX_PHOTO_IDS = 100

/** Ссылка живёт час: экран списка редко держат открытым дольше. */
export const PHOTO_URL_TTL_SECONDS = 3600

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** ?ids=a,b,c → уникальные UUID, не больше MAX_PHOTO_IDS; мусор отбрасывается. */
export function parsePersonIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  const ids = raw.split(',').map(s => s.trim()).filter(s => UUID_RE.test(s))
  return [...new Set(ids.map(s => s.toLowerCase()))].slice(0, MAX_PHOTO_IDS)
}

export interface JourneyOwner { id: string; person_id: string }
export interface PhotoDoc {
  journey_id: string
  storage_path: string | null
  mime_type: string | null
  created_at: string
}

/**
 * person_id → путь файла последнего фото. Чистая функция: на вход — пути
 * учёбы людей и их фото-документы (уже только активные и вида 'photo').
 */
export function pickLatestPhotoPaths(
  journeys: readonly JourneyOwner[],
  docs: readonly PhotoDoc[],
): Map<string, string> {
  const personByJourney = new Map(journeys.map(j => [j.id, j.person_id]))
  const best = new Map<string, PhotoDoc>()
  for (const d of docs) {
    const personId = personByJourney.get(d.journey_id)
    if (!personId || !d.storage_path) continue
    if (!(PHOTO_MIME_TYPES as readonly string[]).includes(d.mime_type ?? '')) continue
    const cur = best.get(personId)
    if (!cur || d.created_at > cur.created_at) best.set(personId, d)
  }
  return new Map([...best].map(([personId, d]) => [personId, d.storage_path as string]))
}
