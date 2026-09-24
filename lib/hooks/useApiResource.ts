'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Единый загрузчик для самого частого паттерна в клиентских компонентах:
 * один GET → data, с состояниями loading/error и перезагрузкой (reload).
 * Раньше это был скопированный вручную блок useState(data/loading/error) +
 * useCallback(load) + useEffect(load) в десятках компонентов.
 *
 * Поведение точно повторяет прежний ручной блок:
 *   • loading стартует true;
 *   • !res.ok → бросаем Error с текстом из тела ответа (error) или fallbackError;
 *   • сетевой сбой → тот же fallbackError;
 *   • data сбрасывается в null на время повторной загрузки? — НЕТ (как и раньше:
 *     старые данные остаются видимыми до успешной перезагрузки).
 *
 * Адаптируй точечно — только там, где ручной блок совпадает 1:1. Компоненты со
 * «тихим» catch, множественными фетчами или своей семантикой не трогаем.
 */
export function useApiResource<T>(
  url: string,
  fallbackError: string,
): {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  setData: React.Dispatch<React.SetStateAction<T | null>>
} {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? fallbackError)
      }
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : fallbackError)
    } finally {
      setLoading(false)
    }
  }, [url, fallbackError])

  useEffect(() => { reload() }, [reload])

  return { data, loading, error, reload, setData }
}
