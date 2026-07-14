'use client'

import { useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Props {
  onClose: () => void
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  )
}

function Field({
  label, value, onChange, show, onToggle, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggle: () => void
  placeholder?: string
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{label}</span>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', paddingBlock: 8, paddingInlineStart: 10, paddingInlineEnd: 38, borderRadius: 8,
            border: '1px solid #D1D5DB', fontSize: 13, outline: 'none', boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          onClick={onToggle}
          style={{
            position: 'absolute', insetInlineEnd: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0,
            display: 'flex', alignItems: 'center',
          }}
        >
          <EyeIcon open={show} />
        </button>
      </div>
    </label>
  )
}

export default function ChangePasswordModal({ onClose }: Props) {
  const t = useTranslations('change_password')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  async function submit() {
    setError('')
    if (!current) { setError(t('err_current_required')); return }
    if (next.length < 8) { setError(t('err_min_8')); return }
    if (next !== confirm) { setError(t('err_mismatch')); return }

    setSaving(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? t('err_generic')); return }
      setSuccess(true)
      setTimeout(() => onClose(), 1000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      backgroundColor: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 420,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #E5E7EB',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <p style={{ fontWeight: 600, fontSize: 15, color: '#1F2937' }}>{t('title')}</p>
          <button onClick={onClose} style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {success ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', backgroundColor: '#D1FAE5',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
            }}>
              <svg width="24" height="24" fill="none" stroke="#059669" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p style={{ fontWeight: 600, color: '#065F46', fontSize: 14 }}>{t('success')}</p>
          </div>
        ) : (
          <>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field
                label={t('current_label')}
                value={current}
                onChange={setCurrent}
                show={showCurrent}
                onToggle={() => setShowCurrent(v => !v)}
              />
              <Field
                label={t('new_label')}
                value={next}
                onChange={setNext}
                show={showNext}
                onToggle={() => setShowNext(v => !v)}
                placeholder={t('new_placeholder')}
              />
              <Field
                label={t('confirm_label')}
                value={confirm}
                onChange={setConfirm}
                show={showConfirm}
                onToggle={() => setShowConfirm(v => !v)}
              />
              {error && (
                <p style={{ fontSize: 12, color: '#DC2626', margin: 0 }}>{error}</p>
              )}
            </div>

            <div style={{
              padding: '12px 20px', borderTop: '1px solid #E5E7EB',
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>
              <button
                onClick={onClose}
                style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151' }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={submit}
                disabled={saving}
                style={{
                  padding: '7px 16px', borderRadius: 8, backgroundColor: '#3B82F6',
                  color: '#fff', border: 'none', fontSize: 13,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? t('saving') : t('save')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
