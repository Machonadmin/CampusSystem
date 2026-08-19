'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDateTime } from '@/lib/i18n/format-date'

interface Note { id: string; body: string; created_at: string; author: string | null }

/**
 * Заметки к уроку — журнал (append-only). Учитель/руководитель пишет заметку,
 * она видна всем, кто выше. Устойчиво к отсутствию таблицы (feature not migrated).
 */
export default function LessonNotes({ lessonId, accentColor }: { lessonId: string; accentColor: string }) {
  const t = useTranslations('education.lesson_notes')
  const { lang } = useLang()
  const [notes, setNotes] = useState<Note[]>([])
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/education/lessons/${lessonId}/notes`)
      if (res.ok) { const b = await res.json(); setNotes(b.notes ?? []) }
    } catch { /* тихо */ }
  }, [lessonId])
  useEffect(() => { load() }, [load])

  async function add() {
    const text = body.trim()
    if (!text) return
    setSaving(true)
    try {
      const res = await fetch(`/api/education/lessons/${lessonId}/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text }),
      })
      if (res.ok) { setBody(''); load() }
    } finally { setSaving(false) }
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 8 }}>{t('title')}</div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={2} placeholder={t('placeholder')}
          style={{ flex: 1, padding: '8px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', resize: 'vertical' }} />
        <button onClick={add} disabled={saving || !body.trim()}
          style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: accentColor, border: 'none', borderRadius: 8, padding: '9px 14px', cursor: body.trim() ? 'pointer' : 'default', opacity: body.trim() && !saving ? 1 : 0.6, whiteSpace: 'nowrap' }}>
          {t('add')}
        </button>
      </div>

      {notes.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {notes.map(n => (
            <div key={n.id} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{n.body}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>
                {formatDateTime(n.created_at, lang)}{n.author ? ` · ${t('by')} ${n.author}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
