'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { DEFAULT_UI_PREFS, sanitizeUiPrefs, type UiPrefs } from './ui-prefs'

/**
 * Личная раскладка интерфейса на клиенте: грузится ОДИН раз на весь дашборд
 * (боковое меню, главная и «הפרופיל שלי» читают одно и то же), сохраняется на
 * сервер — поэтому одинакова на компьютере и телефоне.
 *
 * Пока раскладка не загрузилась (или сервер недоступен) — действует раскладка
 * по умолчанию, т.е. всё выглядит ровно как до появления личных настроек.
 */

interface UiPrefsCtx {
  prefs: UiPrefs
  /** Раскладка загружена с сервера (или стало ясно, что её нет). */
  loaded: boolean
  /** false — таблицы ещё нет (миграция не запущена): сохранить нельзя. */
  persisted: boolean
  /**
   * Сохранить новую раскладку. Экран меняется сразу; если сервер отказал —
   * откатывается назад и возвращается текст ошибки (для тоста).
   */
  save: (next: UiPrefs) => Promise<{ ok: true } | { ok: false; error: string | null }>
}

const Ctx = createContext<UiPrefsCtx>({
  prefs: DEFAULT_UI_PREFS,
  loaded: false,
  persisted: false,
  save: async () => ({ ok: false, error: null }),
})

export function UiPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UiPrefs>(DEFAULT_UI_PREFS)
  const [loaded, setLoaded] = useState(false)
  const [persisted, setPersisted] = useState(false)
  // Последняя подтверждённая сервером раскладка — для отката при ошибке.
  const confirmed = useRef<UiPrefs>(DEFAULT_UI_PREFS)

  useEffect(() => {
    let alive = true
    fetch('/api/me/preferences')
      .then(r => (r.ok ? r.json() : null))
      .then((d: { prefs?: unknown; persisted?: boolean } | null) => {
        if (!alive || !d) return
        const p = sanitizeUiPrefs(d.prefs)
        confirmed.current = p
        setPrefs(p)
        setPersisted(d.persisted === true)
      })
      .catch(() => { /* тихо: остаётся раскладка по умолчанию */ })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [])

  const save = useCallback(async (next: UiPrefs) => {
    const clean = sanitizeUiPrefs(next)
    setPrefs(clean)
    try {
      const res = await fetch('/api/me/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefs: clean }),
      })
      const body = await res.json().catch(() => null) as { prefs?: unknown; error?: string } | null
      if (!res.ok) {
        setPrefs(confirmed.current)
        return { ok: false as const, error: body?.error ?? null }
      }
      const saved = sanitizeUiPrefs(body?.prefs ?? clean)
      confirmed.current = saved
      setPrefs(saved)
      setPersisted(true)
      return { ok: true as const }
    } catch {
      setPrefs(confirmed.current)
      return { ok: false as const, error: null }
    }
  }, [])

  return <Ctx.Provider value={{ prefs, loaded, persisted, save }}>{children}</Ctx.Provider>
}

export function useUiPrefs(): UiPrefsCtx {
  return useContext(Ctx)
}
