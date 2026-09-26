'use client'

import { useState } from 'react'
import { toast } from '@/components/ui/toast'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'

/** Фолбэк, если настройки финансов не прочитались (нет таблицы/строки). */
const FALLBACK_PERCENT = 90

/**
 * «בקשת הנחה» в карточке студентки: сотрудник вводит процент скидки на обучение
 * и отправляет ЗАПРОС (tuition_discount_approvals, статус pending). Автоматической
 * скидки нет — её утверждает финансовая роль в «אישורי הנחות».
 *
 * Поле заранее заполнено дефолтом finance_settings.default_discount_percent —
 * страница читает его на сервере и передаёт пропом defaultPercent (секретарю
 * учёбы GET /api/finance/settings закрыт). Серое, пока его не тронули: не
 * тронули — уходит этот дефолт. Панель показывается
 * только тем, кому сервер разрешает POST (см. canRequestTuitionDiscount) —
 * решение принимает страница карточки (проп canRequestDiscount в LeadViewClient).
 */
export default function DiscountRequestPanel({ journeyId, defaultPercent }: { journeyId: string; defaultPercent?: number | null }) {
  const t = useTranslations('finance.discount_request')
  const primary = getModuleColor('finance', 'primary')

  const [percent, setPercent] = useState<string>(String(typeof defaultPercent === 'number' && Number.isFinite(defaultPercent) ? defaultPercent : FALLBACK_PERCENT))
  const [touched, setTouched] = useState(false)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<'sent' | 'exists' | null>(null)

  const num = Number(percent)
  const valid = percent.trim() !== '' && Number.isFinite(num) && num >= 0 && num <= 100

  async function submit() {
    if (!valid || sending) return
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/finance/discount-approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journey_id: journeyId,
          requested_percent: num,
          note: note.trim() || null,
        }),
      })
      if (res.status === 409) {
        setResult('exists')
        toast(t('exists'), 'error')
        return
      }
      if (res.status === 503) {
        toast(t('not_migrated'), 'error')
        return
      }
      if (res.status === 403) {
        toast(t('forbidden'), 'error')
        return
      }
      if (!res.ok) {
        toast(t('failed'), 'error')
        return
      }
      setResult('sent')
      setNote('')
      toast(t('sent'), 'success')
    } catch {
      toast(t('failed'), 'error')
    } finally {
      setSending(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    fontSize: 13, padding: '7px 10px', borderRadius: 8,
    border: '1px solid var(--border-strong)', background: 'var(--surface)',
    color: 'var(--text)', fontFamily: 'inherit',
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{t('title')}</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>{t('hint')}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text)', minWidth: 110 }}>{t('percent_label')}</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            inputMode="decimal"
            value={percent}
            onChange={e => { setPercent(e.target.value); setTouched(true); setResult(null) }}
            aria-invalid={!valid}
            style={{
              ...inputStyle, width: 90, fontFamily: 'var(--font-mono)',
              // Серый, пока значение — невыбранный дефолт; после правки — обычный.
              color: touched ? 'var(--text)' : 'var(--text-faint)',
              borderColor: valid ? 'var(--border-strong)' : 'var(--danger)',
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>%</span>
        </label>
        {!valid && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{t('percent_range')}</div>}

        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={t('note_placeholder')}
          rows={2}
          maxLength={2000}
          style={{ ...inputStyle, resize: 'vertical' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={submit}
            disabled={!valid || sending}
            style={{
              fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, border: 'none',
              background: primary, color: '#fff',
              cursor: !valid || sending ? 'default' : 'pointer',
              opacity: !valid || sending ? 0.5 : 1,
            }}
          >
            {sending ? t('sending') : t('submit')}
          </button>
          {result === 'sent' && <span style={{ fontSize: 12, color: 'var(--success)' }}>{t('sent')}</span>}
          {result === 'exists' && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{t('exists')}</span>}
        </div>
      </div>
    </div>
  )
}
