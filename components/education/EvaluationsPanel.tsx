'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDateTime } from '@/lib/i18n/format-date'
import { getModuleColor } from '@/lib/module-colors'

interface Evaluation { id: string; body: string; created_at: string; author: string | null }

/**
 * Отзывы (חוות דעת) на ученицу. Читают все, кто вправе видеть студентку;
 * пишет руководитель или учитель, которому открыто write_evaluation. Рендерит
 * null, если нет отзывов и писать нельзя (не засорять карточку пустым блоком).
 */
export default function EvaluationsPanel({ journeyId }: { journeyId: string }) {
  const t = useTranslations('education.evaluations')
  const { lang } = useLang()
  const accent = getModuleColor('education')

  const [items, setItems] = useState<Evaluation[]>([])
  const [canWrite, setCanWrite] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/evaluations`)
      if (res.ok) { const b = await res.json(); setItems(b.evaluations ?? []); setCanWrite(!!b.can_write) }
    } catch { /* тихо */ } finally { setLoaded(true) }
  }, [journeyId])
  useEffect(() => { load() }, [load])

  async function add() {
    const text = body.trim()
    if (!text) return
    setSaving(true)
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/evaluations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }),
      })
      if (res.ok) { setBody(''); load() }
    } finally { setSaving(false) }
  }

  if (!loaded) return null
  if (items.length === 0 && !canWrite) return null

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{t('title')}</div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 12 }}>{t('subtitle')}</div>

      {canWrite && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: items.length ? 12 : 0 }}>
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={2} placeholder={t('placeholder')}
            style={{ flex: 1, padding: '8px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', resize: 'vertical' }} />
          <button onClick={add} disabled={saving || !body.trim()}
            style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: accent, border: 'none', borderRadius: 8, padding: '9px 14px', cursor: body.trim() ? 'pointer' : 'default', opacity: body.trim() && !saving ? 1 : 0.6, whiteSpace: 'nowrap' }}>
            {t('add')}
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: '8px 0' }}>{t('empty')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map(ev => (
            <div key={ev.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px' }}>
              <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{ev.body}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                {formatDateTime(ev.created_at, lang)}{ev.author ? ` · ${t('by')} ${ev.author}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
