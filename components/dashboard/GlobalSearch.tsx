'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'

interface Result {
  person_id: string
  name: string
  hebrew_name: string | null
  email: string | null
  status: string
  link: string
}

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  lead:      { bg: 'var(--info-tint)', fg: 'var(--info)' },
  applicant: { bg: 'var(--violet-tint)', fg: 'var(--violet)' },
  student:   { bg: 'var(--success-tint)', fg: 'var(--success)' },
  staff:     { bg: 'var(--surface-2)', fg: 'var(--text)' },
}

/**
 * Глобальный поиск людей в шапке. Дебаунс, выпадающий список результатов,
 * навигация по клику. Сохраняет id="global-search" для фокуса по Ctrl/Cmd+K.
 */
export default function GlobalSearch({ searchHint }: { searchHint: string }) {
  const t = useTranslations('search')
  const { isRTL } = useLang()
  const router = useRouter()

  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`)
      if (res.ok) { const b = await res.json(); setResults(b.results ?? []); setOpen(true) }
    } catch { /* тихо */ } finally { setLoading(false) }
  }, [])

  function onChange(v: string) {
    setQ(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => search(v), 250)
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function go(r: Result) {
    setOpen(false); setQ('')
    router.push(r.link)
  }

  return (
    <div className="flex-1 max-w-xs mx-auto relative" ref={ref}>
      <div className="relative">
        <svg
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          style={{ [isRTL ? 'right' : 'left']: '12px', color: 'var(--text-faint)' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
        </svg>
        <input
          id="global-search"
          type="text"
          value={q}
          onChange={e => onChange(e.target.value)}
          onFocus={() => { if (results.length) setOpen(true) }}
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
          placeholder={t('placeholder')}
          autoComplete="off"
          className="gsearch-input w-full rounded-lg py-2 text-sm focus:outline-none transition"
          style={{
            paddingLeft: isRTL ? '48px' : '36px', paddingRight: isRTL ? '36px' : '52px',
            background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)',
          }}
        />
        <kbd
          className="absolute top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5 rounded font-mono hidden sm:block"
          style={{ [isRTL ? 'left' : 'right']: '10px', color: 'var(--text-faint)', background: 'var(--bg)' }}
        >
          {searchHint}
        </kbd>
      </div>

      {open && q.trim().length >= 2 && (
        <div
          className="absolute mt-2 w-full rounded-xl z-50 overflow-hidden"
          style={{ maxHeight: 360, overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
        >
          {loading && results.length === 0 ? (
            <div className="px-4 py-3 text-sm" style={{ color: 'var(--text-faint)' }}>{t('searching')}</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm" style={{ color: 'var(--text-faint)' }}>{t('no_results')}</div>
          ) : (
            results.map(r => {
              const c = STATUS_COLOR[r.status] ?? STATUS_COLOR.staff
              return (
                <button
                  key={r.person_id}
                  onClick={() => go(r)}
                  className="menu-item w-full text-start px-4 py-2.5 transition flex items-center gap-2"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text)' }}>{r.name}</div>
                    {r.email && <div className="text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{r.email}</div>}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: c.bg, color: c.fg, flexShrink: 0 }}>
                    {t(`status.${r.status}`, r.status)}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
