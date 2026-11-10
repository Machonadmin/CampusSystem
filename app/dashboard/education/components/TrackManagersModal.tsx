'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { PersonSelect } from '@/components/ui/person-select'
import { toastError } from '@/components/ui/toast'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Props {
  trackId: string
  trackName: string
  onClose: () => void
}

/** Ответственные маршрута (מנהלי מסלול): выбирают студенток на «המסלול שלי». */
export default function TrackManagersModal({ trackId, trackName, onClose }: Props) {
  const t = useTranslations('education.tracks')
  const tCommon = useTranslations('common')
  const [managers, setManagers] = useState<Array<{ id: string; name: string }>>([])
  const [picker, setPicker] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notMigrated, setNotMigrated] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/education/study-tracks/${trackId}/managers`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(b => { if (alive) { setManagers(b.managers ?? []); setNotMigrated(!!b.not_migrated) } })
      .catch(() => { if (alive) toastError(tCommon('load_error')) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [trackId, tCommon])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/education/study-tracks/${trackId}/managers`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_ids: managers.map(m => m.id) }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string }
        toastError(b.error ?? tCommon('error'))
        return
      }
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <Modal onClose={onClose} maxWidth={460} closeOnBackdrop panelStyle={{ padding: 24, maxHeight: 'none', overflowY: 'visible' }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: '0 0 6px' }}>
        {t('managers_title').replace('{name}', trackName)}
      </h2>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14 }}>{t('managers_hint')}</div>

      {notMigrated && (
        <div style={{ padding: 10, marginBottom: 12, background: 'var(--warn-tint, var(--surface-2))', borderRadius: 6, fontSize: 13 }}>
          {t('managers_not_migrated')}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, minHeight: 24 }}>
            {managers.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('managers_empty')}</span>}
            {managers.map(m => (
              <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 12, background: 'var(--surface-2)', fontSize: 12, color: 'var(--text)' }}>
                {m.name}
                <button type="button" aria-label={tCommon('delete')} onClick={() => setManagers(prev => prev.filter(x => x.id !== m.id))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
          <PersonSelect
            value={picker}
            allowAdd={false}
            placeholder={t('managers_add')}
            onChange={(id, p) => {
              if (id && !managers.some(m => m.id === id)) {
                setManagers(prev => [...prev, { id, name: p?.hebrew_name || p?.full_name || '—' }])
              }
              setPicker(null)
            }}
          />
        </>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
        <Button onClick={onClose} disabled={saving}>{tCommon('cancel')}</Button>
        <Button variant="primary" onClick={save} disabled={saving || loading || notMigrated}>{saving ? tCommon('saving') : tCommon('save')}</Button>
      </div>
    </Modal>
  )
}
