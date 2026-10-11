'use client'

import { useEffect, useRef, useState } from 'react'
import { MAX_PHOTO_IDS } from '@/lib/persons/profile-photos'

/**
 * Фото профиля для кружков у имени: person_id → ссылка (GET /api/persons/photos).
 * Спрашивает только про новых людей (догрузка списка не перезапрашивает
 * старых). Если права persons.view_photos нет (enabled: false), больше не
 * спрашивает вовсе — у такого пользователя везде инициалы. Ошибка сети тоже
 * просто оставляет инициалы.
 */
export function usePersonPhotos(personIds: readonly string[]): Record<string, string> {
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const asked = useRef(new Set<string>())
  const disabled = useRef(false)
  const key = personIds.join(',')

  useEffect(() => {
    if (disabled.current || !key) return
    const fresh = [...new Set(key.split(','))].filter(id => id && !asked.current.has(id))
    if (fresh.length === 0) return
    for (const id of fresh) asked.current.add(id)
    for (let i = 0; i < fresh.length; i += MAX_PHOTO_IDS) {
      const chunk = fresh.slice(i, i + MAX_PHOTO_IDS)
      fetch(`/api/persons/photos?ids=${chunk.join(',')}`)
        .then(r => (r.ok ? r.json() : null))
        .then((d: { enabled?: boolean; photos?: Record<string, string> } | null) => {
          if (!d) return
          if (!d.enabled) { disabled.current = true; return }
          if (d.photos && Object.keys(d.photos).length > 0) setPhotos(p => ({ ...p, ...d.photos }))
        })
        .catch(() => { /* остаются инициалы */ })
    }
  }, [key])

  return photos
}
