'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'

interface ChavrutaSession {
  id: string
  entry_date: string
  teacher_name: string
  summary: string | null
  private_notes?: string | null
}

/**
 * Панель истории хеврута для карточки студентки в дашборде (§E). Сотрудник видит
 * полную историю, ВКЛЮЧАЯ личные заметки преподавателя (private_notes), которые
 * сервер отдаёт только персоналу. Только чтение — редактирование на странице
 * преподавателя /dashboard/chavruta. На 503 — нейтральное пусто.
 */
export default function StaffChavrutaPanel({ journeyId }: { journeyId: string; canManage?: boolean }) {
  const t = useTranslations('chavruta')
  const { lang } = useLang()
  const [sessions, setSessions] = useState<ChavrutaSession[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/education/journeys/${journeyId}/chavruta`)
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (alive) setSessions(b?.sessions ?? []) })
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

  if (!loaded) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>{t('staff_history_title')}</h3>

      {sessions.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('portal_empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {sessions.map(s => (
            <div key={s.id} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{s.teacher_name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{fmtDate(s.entry_date)}</div>
              </div>
              {s.summary && (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{s.summary}</div>
              )}
              {s.private_notes && (
                <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 6, background: 'var(--danger-tint, #FEF2F2)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger, #B91C1C)', marginBottom: 2 }}>{t('private_not_visible_to_student')}</div>
                  <div style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{s.private_notes}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
