'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import SignatureCapture, { type SignatureMethod, type SignaturePayload } from '@/components/workflow/SignatureCapture'

interface Final {
  id: string
  code: string
  name_ru: string
  is_positive: boolean
  sort_order: number
}
interface PendingStage {
  stage_instance_id: string
  activated_at: string | null
  journey_id: string | null
  stage_code: string
  stage_name: string
  applicant: {
    full_name: string
    hebrew_name: string | null
    email: string | null
    phones: string[]
    photo_url: string | null
  }
  finals: Final[]
}

/**
 * Личная очередь «Ожидают моей подписи» для подписантов приёмной комиссии
 * (учёба/общежитие/еврейство/директор). Самодостаточна: грузит
 * /api/workflow/my-pending-stages и не рендерит ничего, если очередь пуста.
 * Подпись — через общий role-gated /api/workflow/stages/.../complete.
 */
export default function PendingSignatures() {
  const t = useTranslations('education')
  const primary = getModuleColor('education', 'primary')
  const light = getModuleColor('education', 'light')

  const [stages, setStages] = useState<PendingStage[]>([])
  const [sigMethod, setSigMethod] = useState<SignatureMethod>('both')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/workflow/my-pending-stages')
      if (!res.ok) { setLoaded(true); return }
      const b = await res.json()
      setStages(b.stages ?? [])
      setSigMethod((b.signature_method ?? 'both') as SignatureMethod)
    } catch { /* тихо */ }
    finally { setLoaded(true) }
  }, [])

  useEffect(() => { load() }, [load])

  if (!loaded || stages.length === 0) return null

  return (
    <div style={{ background: '#fff', border: `1px solid ${primary}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>{t('pending_signatures.title')}</h2>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: light, color: primary }}>
          {stages.length} · {t('pending_signatures.count_badge')}
        </span>
      </div>
      <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 14 }}>{t('pending_signatures.subtitle')}</div>

      <div style={{ display: 'grid', gap: 12 }}>
        {stages.map(s => (
          <PendingCard key={s.stage_instance_id} stage={s} sigMethod={sigMethod} onSigned={load} />
        ))}
      </div>
    </div>
  )
}

function PendingCard({
  stage, sigMethod, onSigned,
}: {
  stage: PendingStage
  sigMethod: SignatureMethod
  onSigned: () => void
}) {
  const t = useTranslations('education')
  const tCommon = useTranslations('common')
  const router = useRouter()
  const primary = getModuleColor('education', 'primary')

  const [open, setOpen] = useState(false)
  const [selectedFinal, setSelectedFinal] = useState<string | null>(null)
  const [sig, setSig] = useState<SignaturePayload | null>(null)
  const [note, setNote] = useState('')
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState('')

  const a = stage.applicant
  const name = a.full_name || a.hebrew_name || '—'
  const stageLabel = t(`acceptance_stages.${stage.stage_code}`, stage.stage_name)

  function finalLabel(f: Final): string {
    return t(`acceptance_finals.${f.code}`, f.name_ru)
  }

  async function submit() {
    if (!selectedFinal) return
    setSigning(true)
    setError('')
    try {
      let signatureBody: Record<string, unknown> | undefined
      if (sig) {
        if (sig.kind === 'drawn' && sig.drawing_blob) {
          const fd = new FormData()
          fd.append('file', sig.drawing_blob, 'signature.png')
          const up = await fetch(`/api/workflow/stages/${stage.stage_instance_id}/signature/upload`, { method: 'POST', body: fd })
          if (!up.ok) {
            const d = await up.json().catch(() => ({})) as { error?: string }
            setError(d.error ?? t('pending_signatures.sign_error')); return
          }
          const { storage_path } = await up.json() as { storage_path: string }
          signatureBody = { kind: 'drawn', drawing_path: storage_path }
        } else if (sig.kind === 'typed' && sig.typed_name) {
          signatureBody = { kind: 'typed', typed_name: sig.typed_name }
        }
      }

      const rd: Record<string, unknown> = {}
      if (signatureBody) rd.signature = signatureBody
      if (note.trim()) rd.note = note.trim()
      const body: Record<string, unknown> = { final_code: selectedFinal }
      if (Object.keys(rd).length) body.result_data = rd

      const res = await fetch(`/api/workflow/stages/${stage.stage_instance_id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? t('pending_signatures.sign_error')); return
      }
      onSigned()
    } finally {
      setSigning(false)
    }
  }

  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#F9FAFB' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: '#1F2937' }}>{name}</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{stageLabel}</div>
        </div>
        {stage.journey_id && (
          <button
            onClick={() => router.push(`/dashboard/education/leads/${stage.journey_id}`)}
            style={{ fontSize: 12, fontWeight: 600, color: primary, background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {t('pending_signatures.open_profile')}
          </button>
        )}
        <button
          onClick={() => setOpen(o => !o)}
          style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: primary, border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {open ? t('pending_signatures.hide') : t('pending_signatures.open')}
        </button>
      </div>

      {open && (
        <div style={{ padding: 14, display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              {t('pending_signatures.decision')}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {stage.finals.map(f => (
                <button
                  key={f.id}
                  onClick={() => { setSelectedFinal(f.code); setSig(null); setError('') }}
                  style={{
                    fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                    border: `1px solid ${selectedFinal === f.code ? (f.is_positive ? '#059669' : '#DC2626') : '#D1D5DB'}`,
                    background: selectedFinal === f.code ? (f.is_positive ? '#ECFDF5' : '#FEF2F2') : '#fff',
                    color: selectedFinal === f.code ? (f.is_positive ? '#047857' : '#B91C1C') : '#374151',
                  }}
                >
                  {finalLabel(f)}
                </button>
              ))}
            </div>
          </div>

          {selectedFinal && (
            <div style={{ display: 'grid', gap: 10, borderTop: '1px solid #F3F4F6', paddingTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{t('pending_signatures.sign_title')}</div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={`${tCommon('optional_note')} — ${tCommon('note_placeholder')}`}
                rows={2}
                style={{ fontSize: 13, padding: '8px 10px', border: '1px solid #D1D5DB', borderRadius: 8, width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <SignatureCapture method={sigMethod} onChange={setSig} />
              {error && <div style={{ fontSize: 12, color: '#DC2626' }}>{error}</div>}
              <button
                onClick={submit}
                disabled={signing || !sig}
                style={{
                  justifySelf: 'start', fontSize: 13, fontWeight: 600, color: '#fff',
                  background: signing || !sig ? '#9CA3AF' : primary,
                  border: 'none', borderRadius: 8, padding: '9px 20px',
                  cursor: signing || !sig ? 'default' : 'pointer',
                }}
              >
                {signing ? t('pending_signatures.signing') : t('pending_signatures.confirm')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
