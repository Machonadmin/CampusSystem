'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDateTime } from '@/lib/i18n/format-date'
import { translateSystemEvent } from '@/lib/i18n/workflow-text'
import AddToCalendar from '@/components/calendar/AddToCalendar'

interface ProcessEvent {
  id: string
  event_type: 'system' | 'note' | 'call' | 'meeting' | 'message' | 'email'
  content: string
  author_id: string | null
  author_name: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

const EVENT_ICON: Record<string, string> = {
  note: '📝',
  call: '📞',
  meeting: '🤝',
  message: '✉️',
  email: '📧',
}

const MANUAL_TYPES = ['note', 'call', 'meeting', 'message', 'email'] as const

interface Props {
  stageInstanceId: string
  canManage: boolean
}

export default function StageEventsFeed({ stageInstanceId, canManage }: Props) {
  const t = useTranslations('events')
  const tWf = useTranslations('workflow')
  const { lang } = useLang()

  const [events, setEvents] = useState<ProcessEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [newType, setNewType] = useState<string>('note')
  const [newContent, setNewContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/workflow/stages/${stageInstanceId}/events`)
      if (res.ok) setEvents(await res.json() as ProcessEvent[])
    } finally {
      setLoading(false)
    }
  }, [stageInstanceId])

  useEffect(() => { loadEvents() }, [loadEvents])

  async function addEvent() {
    if (!newContent.trim()) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch(`/api/workflow/stages/${stageInstanceId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: newType, content: newContent.trim() }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setSaveError(d.error ?? tWf('error'))
        return
      }
      setNewContent('')
      loadEvents()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        {t('title')}
      </div>

      {/* Events list */}
      {loading ? (
        <div style={{ color: 'var(--text-faint)', fontSize: 12, padding: '8px 0' }}>…</div>
      ) : events.length === 0 ? (
        <div style={{ color: 'var(--text-faint)', fontSize: 12, padding: '8px 0', fontStyle: 'italic' }}>{t('empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {events.map(ev => {
            const isSystem = ev.event_type === 'system'
            return (
              <div
                key={ev.id}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 2,
                  padding: '8px 10px', borderRadius: 6,
                  background: isSystem ? 'var(--surface-2)' : 'var(--surface)',
                  border: isSystem ? '1px solid var(--surface-2)' : '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {isSystem ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>
                      {t('system_prefix')}
                    </span>
                  ) : (
                    <span style={{ fontSize: 13 }}>{EVENT_ICON[ev.event_type] ?? ''}</span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {formatDateTime(ev.created_at, lang)}
                  </span>
                  {ev.author_name && !isSystem && (
                    <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>
                      {ev.author_name}
                    </span>
                  )}
                  {!isSystem && (
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {t(`types.${ev.event_type}`, ev.event_type)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: isSystem ? 'var(--text-muted)' : 'var(--text)', lineHeight: 1.4, marginLeft: isSystem ? 0 : 22 }}>
                  {isSystem ? translateSystemEvent(ev.content, t) : ev.content}
                </div>
                {!isSystem && (
                  <div style={{ marginLeft: 22, marginTop: 4 }}>
                    <AddToCalendar variant="link" defaultTitle={ev.content.slice(0, 90)} sourceType="note" sourceId={ev.id} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add form */}
      {canManage && (
        <div style={{ borderTop: '1px solid var(--surface-2)', paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            {t('add_title')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <select
              value={newType}
              onChange={e => setNewType(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)' }}
            >
              {MANUAL_TYPES.map(tp => (
                <option key={tp} value={tp}>{EVENT_ICON[tp]} {t(`types.${tp}`, tp)}</option>
              ))}
            </select>
          </div>
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder={t('content_placeholder')}
            rows={3}
            style={{
              width: '100%', fontSize: 13, padding: '8px 10px',
              border: '1px solid var(--border-strong)', borderRadius: 6,
              resize: 'vertical', outline: 'none', color: 'var(--text)',
              boxSizing: 'border-box',
            }}
          />
          {saveError && (
            <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>{saveError}</div>
          )}
          <button
            onClick={addEvent}
            disabled={saving || !newContent.trim()}
            style={{
              marginTop: 8, padding: '7px 16px', fontSize: 12, fontWeight: 500,
              border: 'none', borderRadius: 6, cursor: saving || !newContent.trim() ? 'not-allowed' : 'pointer',
              background: saving || !newContent.trim() ? 'var(--border-strong)' : '#10B981',
              color: '#fff', transition: 'opacity 0.15s',
            }}
          >
            {t('add_button')}
          </button>
        </div>
      )}
    </div>
  )
}
