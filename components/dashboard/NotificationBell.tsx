'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDateTime } from '@/lib/i18n/format-date'

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

/**
 * Колокольчик уведомлений в шапке. Тянет /api/notifications, показывает счётчик
 * непрочитанных и выпадающий список. Клик по пункту помечает прочитанным и ведёт
 * по link. Устойчив к отсутствию таблицы (API отдаёт пусто до миграции).
 */
export default function NotificationBell() {
  const t = useTranslations('notifications')
  const { lang, isRTL } = useLang()
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const b = await res.json() as { notifications?: Notification[]; unread?: number }
      setItems(b.notifications ?? [])
      setUnread(b.unread ?? 0)
    } catch { /* тихо */ }
  }, [])

  useEffect(() => { load() }, [load])

  // Периодически подтягиваем (лёгкий поллинг).
  useEffect(() => {
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function markRead(id?: string) {
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { id } : { all: true }),
      })
    } catch { /* тихо */ }
  }

  async function onItemClick(n: Notification) {
    setOpen(false)
    if (!n.read_at) {
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
      setUnread(u => Math.max(0, u - 1))
      await markRead(n.id)
    }
    if (n.link) router.push(n.link)
  }

  async function onMarkAll() {
    setItems(prev => prev.map(x => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })))
    setUnread(0)
    await markRead()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) load() }}
        className="relative p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-white"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute mt-2 w-80 max-w-[90vw] bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden"
          style={isRTL ? { left: 0 } : { right: 0 }}
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">{t('title')}</span>
            {unread > 0 && (
              <button onClick={onMarkAll} className="text-xs font-medium text-blue-600 hover:underline">
                {t('mark_all_read')}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">{t('empty')}</div>
            ) : (
              items.map(n => (
                <button
                  key={n.id}
                  onClick={() => onItemClick(n)}
                  className={`w-full text-start px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition ${n.read_at ? '' : 'bg-blue-50/40'}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read_at && <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                    <div className={n.read_at ? 'ps-4' : ''} style={{ minWidth: 0 }}>
                      <div className="text-[13px] font-medium text-gray-900 leading-snug">{n.title}</div>
                      {n.body && <div className="text-xs text-gray-500 mt-0.5">{n.body}</div>}
                      <div className="text-[11px] text-gray-400 mt-1">{formatDateTime(n.created_at, lang)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
