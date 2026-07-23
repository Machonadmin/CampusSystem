'use client'

import { useEffect, useState } from 'react'
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
 * Отправка сообщений студентке сотрудником (staff → student): форма
 * (тема + текст → POST) и список отправленных сообщений со статусом
 * прочтения. Показывается в карточке студента при canManage.
 */
export default function StaffStudentMessagesPanel({ journeyId, canManage }: { journeyId: string; canManage: boolean }) {
  const t = useTranslations('education.staff_messages')
  const { lang } = useLang()
  const [messages, setMessages] = useState<Message[]>([])
  const [loaded, setLoaded] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  function load() {
    fetch(`/api/education/journeys/${journeyId}/messages`)
      .then(r => (r.ok ? r.json() : null))
      .then(b => setMessages(b?.messages ?? []))
      .finally(() => setLoaded(true))
  }

  useEffect(() => {
    let alive = true
    fetch(`/api/education/journeys/${journeyId}/messages`)
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (alive) setMessages(b?.messages ?? []) })
      .finally(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [journeyId])

  async function send() {
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    try {
      const r = await fetch(`/api/education/journeys/${journeyId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim() || undefined, body: text }),
      })
      if (r.ok) {
        setSubject('')
        setBody('')
        load()
      }
    } finally {
      setBusy(false)
    }
  }

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

      {canManage && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder={t('subject_ph')}
            maxLength={300}
            style={{ fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={t('body_ph')}
            rows={3}
            maxLength={4000}
            style={{ fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', resize: 'vertical', fontFamily: 'inherit' }}
          />
          <button
            onClick={send}
            disabled={busy || !body.trim()}
            style={{ justifySelf: 'start', fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: (busy || !body.trim()) ? 'not-allowed' : 'pointer', opacity: (busy || !body.trim()) ? 0.6 : 1 }}
          >
            {t('send')}
          </button>
        </div>
      )}

      {messages.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {messages.map(m => (
            <div key={m.id} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              {m.subject && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{m.subject}</div>}
              <div style={{ fontSize: 12.5, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>
                <span>{fmtDate(m.created_at)}</span>
                <span style={{ color: m.read_at ? 'var(--success)' : 'var(--text-faint)' }}>
                  · {m.read_at ? t('read') : t('sent')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
