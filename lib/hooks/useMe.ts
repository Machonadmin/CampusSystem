'use client'

import { useState, useEffect } from 'react'

export interface Me {
  person_id: string
  full_name: string | null
  roles: string[]
}

// Модульный кэш: /api/auth/me тянется один раз на всё приложение.
let cache: Me | null = null
let inflight: Promise<Me | null> | null = null

/** Текущий пользователь (кэшируется). null пока грузится/если не залогинен. */
export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(cache)

  useEffect(() => {
    if (cache) { setMe(cache); return }
    if (!inflight) {
      inflight = fetch('/api/auth/me')
        .then(r => (r.ok ? r.json() : null))
        .then((d: Me | null) => { cache = d; return d })
        .catch(() => null)
    }
    let alive = true
    inflight.then(d => { if (alive) setMe(d) })
    return () => { alive = false }
  }, [])

  return me
}
