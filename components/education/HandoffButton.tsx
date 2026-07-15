'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Заметная кнопка «Передать в приёмную комиссию» на карточке лида. Показывается
 * только когда у лида есть активный этап «Набора» с финалом convert_to_applicant
 * и пользователь вправе конвертировать. Блокируется, пока не заполнены
 * обязательные поля (имя, телефон), показывая, чего не хватает. Действие идёт
 * через общий complete-эндпоинт (convert_to_applicant → приём + задачи + уведомления).
 */
export default function HandoffButton({ journeyId }: { journeyId: string }) {
  const t = useTranslations('education')
  const router = useRouter()

  const [stageId, setStageId] = useState<string | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/handoff`)
      if (!res.ok) { setLoaded(true); return }
      const b = await res.json()
      setStageId(b.stage_instance_id ?? null)
      setMissing(b.missing ?? [])
    } catch { /* тихо */ }
    finally { setLoaded(true) }
  }, [journeyId])

  useEffect(() => { load() }, [load])

  async function handoff() {
    if (!stageId || missing.length > 0) return
    if (!window.confirm(t('handoff.confirm'))) return
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/workflow/stages/${stageId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_code: 'convert_to_applicant' }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? t('handoff.error')); return }
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  // Нет цели (лид уже конвертирован / нет процесса) — не показываем.
  if (!loaded || !stageId) return null

  const ready = missing.length === 0
  const missingLabels = missing.map(m => m === 'name' ? t('handoff.field_name') : m === 'phone' ? t('handoff.field_phone') : m)

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <button
        onClick={handoff}
        disabled={busy || !ready}
        style={{
          width: '100%', padding: '12px', fontSize: 15, fontWeight: 700, color: '#fff',
          border: 'none', borderRadius: 10, cursor: busy || !ready ? 'not-allowed' : 'pointer',
          background: busy || !ready ? 'var(--text-faint)' : 'linear-gradient(135deg,#7C3AED 0%,#DB2777 100%)',
          boxShadow: ready ? '0 2px 10px rgba(124,58,237,0.25)' : 'none',
        }}
      >
        {busy ? t('handoff.converting') : `→ ${t('handoff.button')}`}
      </button>
      {!ready && (
        <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 8, textAlign: 'center' }}>
          {t('handoff.missing')} {missingLabels.join(', ')}
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8, textAlign: 'center' }}>{error}</div>}
    </div>
  )
}
