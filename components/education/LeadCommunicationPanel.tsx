'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDateTime } from '@/lib/i18n/format-date'
import { translateSystemEvent } from '@/lib/i18n/workflow-text'
import AddToCalendar from '@/components/calendar/AddToCalendar'
import { SkeletonRows } from '@/components/ui/Skeleton'
import EmptyState from '@/components/ui/EmptyState'

/**
 * Единая лента коммуникаций лида на УРОВНЕ карточки (не зарытая в выбор
 * подэтапа). Читает/пишет агрегирующий эндпоинт
 * /api/education/journeys/[id]/communications. Переиспользует i18n-namespace
 * 'events' и визуальный язык StageEventsFeed, но живёт как заметная вкладка.
 */

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
  note: '📝', call: '📞', meeting: '🤝', message: '✉️', email: '📧',
}
const MANUAL_TYPES = ['call', 'meeting', 'message', 'email', 'note'] as const

interface Props {
  journeyId: string
  canManage: boolean
}

export default function LeadCommunicationPanel({ journeyId, canManage }: Props) {
  const t = useTranslations('events')
  const tWf = useTranslations('workflow')
  const { lang } = useLang()

  const [events, setEvents] = useState<ProcessEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [newType, setNewType] = useState<string>('call')
  const [newContent, setNewContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/communications`)
      if (res.ok) setEvents(await res.json() as ProcessEvent[])
    } finally {
      setLoading(false)
    }
  }, [journeyId])

  useEffect(() => { load() }, [load])

  async function add() {
    if (!newContent.trim()) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/communications`, {
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
      load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Быстрое добавление — СВЕРХУ, чтобы «записать сразу после общения» было первым действием */}
      {canManage && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            {t('add_title')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {MANUAL_TYPES.map(tp => (
              <button
                key={tp}
                type="button"
                onClick={() => setNewType(tp)}
                style={{
                  fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                  border: newType === tp ? '1px solid var(--success)' : '1px solid var(--border-strong)',
                  background: newType === tp ? 'rgba(16,185,129,0.12)' : 'var(--surface)',
                  color: newType === tp ? 'var(--success)' : 'var(--text-muted)',
                }}
              >
                {EVENT_ICON[tp]} {t(`types.${tp}`, tp)}
              </button>
            ))}
          </div>
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder={t('content_placeholder')}
            rows={3}
            style={{
              width: '100%', fontSize: 14, padding: '10px 12px',
              border: '1px solid var(--border-strong)', borderRadius: 8,
              resize: 'vertical', outline: 'none', color: 'var(--text)', boxSizing: 'border-box',
            }}
          />
          {saveError && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{saveError}</div>}
          <button
            onClick={add}
            disabled={saving || !newContent.trim()}
            style={{
              marginTop: 10, padding: '9px 20px', fontSize: 13, fontWeight: 600,
              border: 'none', borderRadius: 8, cursor: saving || !newContent.trim() ? 'not-allowed' : 'pointer',
              background: saving || !newContent.trim() ? 'var(--border-strong)' : 'var(--success)', color: '#fff',
            }}
          >
            {t('add_button')}
          </button>
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
        {t('title')}
      </div>

      {loading ? (
        <SkeletonRows rows={3} avatar={false} />
      ) : events.length === 0 ? (
        <EmptyState text={t('empty')} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.map(ev => {
            const isSystem = ev.event_type === 'system'
            return (
              <div
                key={ev.id}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 2,
                  padding: '10px 12px', borderRadius: 8,
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
                    <span style={{ fontSize: 14 }}>{EVENT_ICON[ev.event_type] ?? ''}</span>
                  )}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDateTime(ev.created_at, lang)}</span>
                  {ev.author_name && !isSystem && (
                    <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>{ev.author_name}</span>
                  )}
                  {!isSystem && (
                    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t(`types.${ev.event_type}`, ev.event_type)}</span>
                  )}
                </div>
                <div style={{ fontSize: 14, color: isSystem ? 'var(--text-muted)' : 'var(--text)', lineHeight: 1.45, marginInlineStart: isSystem ? 0 : 22 }}>
                  {isSystem ? translateSystemEvent(ev.content, t) : ev.content}
                </div>
                {!isSystem && (
                  <div style={{ marginInlineStart: 22, marginTop: 4 }}>
                    <AddToCalendar variant="link" defaultTitle={ev.content.slice(0, 90)} sourceType="note" sourceId={ev.id} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
