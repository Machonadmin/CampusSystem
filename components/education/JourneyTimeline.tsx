'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDateTime } from '@/lib/i18n/format-date'

interface Item {
  at: string
  type: 'status' | 'signature' | 'document' | 'note'
  actor?: string | null
  from_status?: string | null
  to_status?: string | null
  stage_code?: string | null
  final_code?: string | null
  signer_name?: string | null
  title?: string | null
  doc_type?: string | null
  content?: string | null
}

const ICON: Record<Item['type'], string> = { status: '🔄', signature: '✍️', document: '📄', note: '📝' }
const DOT: Record<Item['type'], string> = { status: '#2563EB', signature: '#059669', document: '#CA8A04', note: '#6B7280' }

/**
 * Хронология по абитуриентке/студентке (сворачиваемая). Грузит агрегированную
 * ленту и показывает смены статуса, подписи, документы и заметки. Рендерит
 * null, если событий нет.
 */
export default function JourneyTimeline({ journeyId }: { journeyId: string }) {
  const t = useTranslations('education')
  const { lang } = useLang()
  const [items, setItems] = useState<Item[]>([])
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/timeline`)
      if (res.ok) { const b = await res.json(); setItems(b.items ?? []) }
    } catch { /* тихо */ } finally { setLoaded(true) }
  }, [journeyId])
  useEffect(() => { load() }, [load])

  if (!loaded || items.length === 0) return null

  function line(it: Item): string {
    if (it.type === 'status') {
      const from = it.from_status ? t(`timeline.status.${it.from_status}`, it.from_status) : null
      const to = t(`timeline.status.${it.to_status}`, it.to_status ?? '')
      return `${t('timeline.status_change')}: ${from ? `${from} → ` : ''}${to}`
    }
    if (it.type === 'signature') {
      const stage = it.stage_code ? t(`acceptance_stages.${it.stage_code}`, it.stage_code) : ''
      const decision = it.final_code ? t(`acceptance_finals.${it.final_code}`, it.final_code) : ''
      return `${t('timeline.signed')}: ${stage}${decision ? ` — ${decision}` : ''}`
    }
    if (it.type === 'document') return `${t('timeline.document_added')}: ${it.title ?? ''}`
    return `${t('timeline.note_added')}: ${it.content ?? ''}`
  }

  function who(it: Item): string | null {
    return it.signer_name || it.actor || null
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', textAlign: 'start', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{t('timeline.title')}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#2563EB' }}>{open ? t('timeline.hide') : `${t('timeline.show')} (${items.length})`}</span>
      </button>

      {open && (
        <div style={{ marginTop: 14, display: 'grid', gap: 0 }}>
          {items.map((it, i) => {
            const w = who(it)
            return (
              <div key={i} style={{ display: 'flex', gap: 10, position: 'relative', paddingBottom: i === items.length - 1 ? 0 : 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#F9FAFB', border: `2px solid ${DOT[it.type]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{ICON[it.type]}</span>
                  {i !== items.length - 1 && <span style={{ flex: 1, width: 2, background: '#F3F4F6', marginTop: 2 }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                  <div style={{ fontSize: 13, color: '#1F2937' }}>{line(it)}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                    {formatDateTime(it.at, lang)}{w ? ` · ${t('timeline.by')} ${w}` : ''}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
