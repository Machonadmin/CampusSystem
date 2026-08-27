'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDate } from '@/lib/i18n/format-date'

/**
 * «Ежедневник» на главной: всегда виден (даже пустой), сверху страницы —
 * чтобы календарь был под рукой, а не только в отдельном разделе. Сводит
 * встречи (appointments) и события (calendar_events) на ближайшие 7 дней,
 * группирует по дням, ведёт в полный календарь. Если у пользователя нет
 * доступа к календарю (оба запроса неуспешны) — секция не рендерится.
 */

interface AgendaItem {
  id: string
  title: string
  date: string           // YYYY-MM-DD
  time: string | null    // HH:MM | null (весь день)
  kind: 'appointment' | 'event'
}

const KIND_ICON: Record<AgendaItem['kind'], string> = { appointment: '🤝', event: '📅' }
const DAYS_AHEAD = 7

export default function HomeAgenda() {
  const t = useTranslations('home')
  const { lang } = useLang()
  const [items, setItems] = useState<AgendaItem[]>([])
  const [visible, setVisible] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const now = new Date()
      const p = (n: number) => String(n).padStart(2, '0')
      const iso = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
      const from = iso(now)
      const to = iso(new Date(now.getTime() + DAYS_AHEAD * 86400000))

      const [apptRes, evRes] = await Promise.all([
        fetch(`/api/calendar/appointments?from=${from}&to=${to}`).catch(() => null),
        fetch(`/api/calendar/events?from=${from}&to=${to}`).catch(() => null),
      ])

      // Нет доступа к календарю вовсе → секцию не показываем.
      if ((!apptRes || !apptRes.ok) && (!evRes || !evRes.ok)) {
        setVisible(false)
        return
      }
      setVisible(true)

      const collected: AgendaItem[] = []
      if (apptRes?.ok) {
        const b = await apptRes.json() as { appointments?: Array<{ id: string; title: string; starts_at: string; status?: string }> }
        for (const a of b.appointments ?? []) {
          if (a.status === 'cancelled') continue
          collected.push({ id: `a_${a.id}`, title: a.title, date: a.starts_at.slice(0, 10), time: a.starts_at.slice(11, 16), kind: 'appointment' })
        }
      }
      if (evRes?.ok) {
        const b = await evRes.json() as { events?: Array<{ id: string; title: string; event_date: string; event_time: string | null; all_day: boolean }> }
        for (const e of b.events ?? []) {
          collected.push({ id: `e_${e.id}`, title: e.title, date: e.event_date, time: e.all_day ? null : (e.event_time?.slice(0, 5) ?? null), kind: 'event' })
        }
      }
      collected.sort((x, y) => (x.date + (x.time ?? '99:99')).localeCompare(y.date + (y.time ?? '99:99')))
      setItems(collected)
    } catch {
      setVisible(false)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (!loaded || !visible) return null

  // Группировка по дате.
  const byDay = new Map<string, AgendaItem[]>()
  for (const it of items) {
    if (!byDay.has(it.date)) byDay.set(it.date, [])
    byDay.get(it.date)!.push(it)
  }
  const todayIso = (() => { const d = new Date(); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` })()

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 className="text-sm font-bold tracking-widest uppercase" style={{ color: 'var(--text-faint)', margin: 0 }}>
          {t('agenda_title')}
        </h2>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, boxShadow: 'var(--shadow)', borderInlineStart: '4px solid var(--violet)' }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)', fontStyle: 'italic' }}>{t('agenda_empty')}</div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {[...byDay.entries()].map(([date, dayItems]) => (
              <div key={date}>
                <div style={{ fontSize: 11, fontWeight: 700, color: date === todayIso ? 'var(--violet)' : 'var(--text-muted)', marginBottom: 6 }}>
                  {date === todayIso ? t('agenda_today') : formatDate(date, lang)}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {dayItems.map(it => (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{KIND_ICON[it.kind]}</span>
                      <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                      <span style={{ marginInlineStart: 'auto', color: 'var(--text-faint)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {it.time ?? t('agenda_all_day')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
