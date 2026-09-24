'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * useState, который переживает уход с экрана и «חזרה» в пределах вкладки
 * (sessionStorage). Нужен спискам: фильтр/поиск раньше сбрасывались, когда
 * человек открывал карточку и возвращался назад.
 *
 * Значение восстанавливается ПОСЛЕ монтирования (иначе расхождение с SSR) —
 * поэтому третий элемент `ready`: грузить данные только когда он true, чтобы
 * не сделать лишний запрос со значением по умолчанию.
 * Хранилище недоступно (приватный режим и т.п.) → работает как обычный useState.
 */
export function useSessionState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initial)
  const [ready, setReady] = useState(false)
  const restored = useRef(false)

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(key)
      if (raw != null) setValue(JSON.parse(raw) as T)
    } catch { /* нет хранилища — остаёмся на initial */ }
    restored.current = true
    setReady(true)
  }, [key])

  useEffect(() => {
    if (!restored.current) return
    try { window.sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
  }, [key, value])

  return [value, setValue, ready]
}
