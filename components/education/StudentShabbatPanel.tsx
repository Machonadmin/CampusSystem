'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'

type ShabbatType = 'shabbat_host' | 'shabbat_family'

interface ShabbatEvent {
  id: string
  entry_date: string
  entry_type: ShabbatType
  host_name: string
  summary: string | null
}

/**
 * Панель «Шабат-приём» для личного кабинета студентки: список событий Шабата,
 * на которые её отметили (дата, принимающий сотрудник, тип приёма, «что было»).
 * Личное резюме сотрудника (private_notes) сюда НЕ приходит и НЕ отображается.
 * journeyId-driven, как остальные Student*Panel. На 503 — нейтральное пусто.
 */
export default function StudentShabbatPanel({ journeyId }: { journeyId: string }) {
  const t = useTranslations('chavruta')
  const { lang } = useLang()
  const [events, setEvents] = useState<ShabbatEvent[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/education/journeys/${journeyId}/shabbat`)
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (alive) setEvents(b?.events ?? []) })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [journeyId])

  const fmtDate = (d: string | null): string => {
    if (!d) return ''
    try {
      const loc = lang === 'ru' ? 'ru-RU' : lang === 'he' ? 'he-IL' : 'en-US'
      const dt = new Date(`${d}T00:00:00Z`)
      if (isNaN(dt.getTime())) return d
      return dt.toLocaleDateString(loc, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    } catch { return d }
  }
  const typeLabel = (ty: ShabbatType): string => t(`shabbat_type_${ty === 'shabbat_host' ? 'host' : 'family'}`)

  if (!loaded) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>{t('shabbat_portal_title')}</h3>

      {events.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('shabbat_empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {events.map(ev => (
            <div key={ev.id} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{ev.host_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{fmtDate(ev.entry_date)}</div>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{typeLabel(ev.entry_type)}</div>
              {ev.summary && (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{ev.summary}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
