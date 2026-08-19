'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'

interface Message {
  id: string
  subject: string | null
  body: string
  from_name: string | null
  created_at: string
  read_at: string | null
}

/**
 * Сообщения студентке от сотрудника (staff → student): список полученных
 * сообщений (тема/текст/отправитель/дата) с индикатором непрочитанного.
 * При открытии панели непрочитанные помечаются прочитанными (PATCH).
 * Только чтение — ответить нельзя (v1). journeyId-driven, как остальные
 * Student*Panel.
 */
export default function StudentMessagesPanel({ journeyId }: { journeyId: string }) {
  const t = useTranslations('education.messages_panel')
  const { lang } = useLang()
  const [messages, setMessages] = useState<Message[]>([])
  const [loaded, setLoaded] = useState(false)
  const marked = useRef(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/education/journeys/${journeyId}/messages`)
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (alive) setMessages(b?.messages ?? []) })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [journeyId])

  // При просмотре панели помечаем непрочитанные прочитанными (один проход).
  useEffect(() => {
    if (!loaded || marked.current) return
    const unread = messages.filter(m => !m.read_at)
    if (unread.length === 0) return
    marked.current = true
    const now = new Date().toISOString()
    Promise.all(unread.map(m =>
      fetch(`/api/education/journeys/${journeyId}/messages`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: m.id }),
      }).catch(() => {})
    )).then(() => {
      setMessages(prev => prev.map(m => (m.read_at ? m : { ...m, read_at: now })))
    })
  }, [loaded, messages, journeyId])

  const fmtDate = (d: string): string => {
    try {
      const loc = lang === 'ru' ? 'ru-RU' : lang === 'he' ? 'he-IL' : 'en-US'
      const dt = new Date(d)
      if (isNaN(dt.getTime())) return d
      return dt.toLocaleDateString(loc, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch { return d }
  }

  if (!loaded) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>{t('title')}</h3>

      {messages.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {messages.map(m => {
            const unread = !m.read_at
            return (
              <div key={m.id} style={{ padding: '10px 12px', borderRadius: 8, background: unread ? 'var(--accent-tint)' : 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: m.subject ? 4 : 0 }}>
                  {unread && <span title={t('unread')} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                  {m.subject && <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{m.subject}</div>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>
                  {m.from_name ? `${t('from')} ${m.from_name} · ` : ''}{fmtDate(m.created_at)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
