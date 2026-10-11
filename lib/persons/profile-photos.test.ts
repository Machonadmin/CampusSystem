import { describe, it, expect } from 'vitest'
import { parsePersonIds, pickLatestPhotoPaths, MAX_PHOTO_IDS, type PhotoDoc } from './profile-photos'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('parsePersonIds', () => {
  it('пусто → пустой список', () => {
    expect(parsePersonIds(null)).toEqual([])
    expect(parsePersonIds('')).toEqual([])
  })

  it('мусор отбрасывается, повторы склеиваются, регистр не важен', () => {
    expect(parsePersonIds(`${A}, not-a-uuid,${B},${A.toUpperCase()},'; drop`)).toEqual([A, B])
  })

  it('не больше MAX_PHOTO_IDS за раз', () => {
    const many = Array.from({ length: MAX_PHOTO_IDS + 20 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    expect(parsePersonIds(many.join(','))).toHaveLength(MAX_PHOTO_IDS)
  })
})

describe('pickLatestPhotoPaths', () => {
  const journeys = [
    { id: 'j1', person_id: A },
    { id: 'j2', person_id: A }, // второй путь учёбы того же человека
    { id: 'j3', person_id: B },
  ]
  const doc = (journey_id: string, path: string | null, created_at: string, mime: string | null = 'image/jpeg'): PhotoDoc =>
    ({ journey_id, storage_path: path, mime_type: mime, created_at })

  it('берётся самое новое фото человека по всем его путям учёбы', () => {
    const out = pickLatestPhotoPaths(journeys, [
      doc('j1', 'old.jpg', '2026-01-01T00:00:00+00:00'),
      doc('j2', 'new.jpg', '2026-05-01T00:00:00+00:00'),
      doc('j3', 'b.png', '2026-02-01T00:00:00+00:00', 'image/png'),
    ])
    expect(Object.fromEntries(out)).toEqual({ [A]: 'new.jpg', [B]: 'b.png' })
  })

  it('не картинка (например, PDF) в кружок не попадает — берётся предыдущее фото', () => {
    const out = pickLatestPhotoPaths(journeys, [
      doc('j1', 'photo.webp', '2026-01-01T00:00:00+00:00', 'image/webp'),
      doc('j1', 'scan.pdf', '2026-06-01T00:00:00+00:00', 'application/pdf'),
    ])
    expect(Object.fromEntries(out)).toEqual({ [A]: 'photo.webp' })
  })

  it('без файла или чужой путь учёбы — пропуск', () => {
    const out = pickLatestPhotoPaths(journeys, [
      doc('j1', null, '2026-01-01T00:00:00+00:00'),
      doc('j-unknown', 'x.jpg', '2026-01-01T00:00:00+00:00'),
    ])
    expect(out.size).toBe(0)
  })
})
