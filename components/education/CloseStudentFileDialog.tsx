'use client'

import { useState } from 'react'
import { DateInput } from '@/components/ui/date-input'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { Modal } from '@/components/ui/Modal'
import { localISODate } from '@/lib/dates'

/**
 * Окно «סגירת תיק לימודים» в списке студенток. Прежде чем закрыть תיק, предлагает
 * подходящие переходы учебного цикла (בוגרת / הפסקת לימודים / חופשה — нужны
 * причина и дата, как в StudentLifecyclePanel), и только потом — само закрытие
 * (DELETE /api/education/students/[id], выставляет closed_at; статус не меняется).
 * Решение владельца 2026-11-10: окно подтверждения с альтернативами, без удаления.
 */

type Choice = 'graduated' | 'expelled' | 'on_leave' | 'close'
type Transition = Exclude<Choice, 'close'>

interface Props {
  journeyId: string
  name: string
  /** education_status студентки: переходы доступны только из 'student'. */
  status: string
  onClose: () => void
  /** Вызывается после успешного действия (перезагрузить список). */
  onDone: () => void
}

export default function CloseStudentFileDialog({ journeyId, name, status, onClose, onDone }: Props) {
  const t = useTranslations('education.study.students.close_dialog')
  const tStudents = useTranslations('education.study.students')
  const tLife = useTranslations('education.card.lifecycle')
  const { lang, isRTL } = useLang()

  const transitions: Transition[] = status === 'student' ? ['graduated', 'expelled', 'on_leave'] : []
  const [choice, setChoice] = useState<Choice | null>(transitions.length === 0 ? 'close' : null)
  const [reason, setReason] = useState('')
  const [date, setDate] = useState<Date | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const label: Record<Choice, string> = {
    graduated: t('option_graduate'),
    expelled: t('option_expel'),
    on_leave: t('option_on_leave'),
    close: t('option_close'),
  }

  async function submit() {
    setError(null)
    if (!choice) { setError(t('choose_first')); return }

    let res: Response
    setSubmitting(true)
    try {
      if (choice === 'close') {
        res = await fetch(`/api/education/students/${journeyId}`, { method: 'DELETE' })
      } else {
        if (!reason.trim()) { setError(tLife('error_reason_required')); return }
        if (!date) { setError(tLife('error_date_required')); return }
        res = await fetch(`/api/education/journeys/${journeyId}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to_status: choice, reason: reason.trim(), effective_date: localISODate(date) }),
        })
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error
          ?? (choice === 'close' ? tStudents('expel_failed') : tLife('error_generic')))
        return
      }
      onDone()
    } catch {
      setError(choice === 'close' ? tStudents('expel_failed') : tLife('error_generic'))
    } finally {
      setSubmitting(false)
    }
  }

  const optionStyle = (c: Choice): React.CSSProperties => {
    const selected = choice === c
    const danger = c === 'close'
    return {
      display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'start',
      padding: '9px 12px', fontSize: 13, borderRadius: 8, cursor: submitting ? 'default' : 'pointer',
      border: `1px solid ${selected ? (danger ? 'var(--danger)' : 'var(--accent)') : 'var(--border)'}`,
      background: selected ? (danger ? 'var(--danger-tint)' : 'var(--accent-tint)') : 'var(--surface)',
      color: danger ? 'var(--danger)' : 'var(--text)',
      fontWeight: selected ? 600 : 400,
    }
  }

  const renderOption = (c: Choice) => (
    <button
      key={c}
      type="button"
      role="radio"
      aria-checked={choice === c}
      disabled={submitting}
      onClick={() => { setChoice(c); setError(null) }}
      style={optionStyle(c)}
    >
      <span aria-hidden style={{
        width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
        border: '1.5px solid currentColor',
        background: choice === c ? 'currentColor' : 'transparent',
      }} />
      {label[c]}
    </button>
  )

  const isTransition = choice !== null && choice !== 'close'

  return (
    <Modal
      onClose={() => { if (!submitting) onClose() }}
      maxWidth={440}
      zIndex={50}
      closeOnBackdrop
      panelStyle={{ padding: 24, boxShadow: 'var(--shadow-lg)' }}
    >
      <div dir={isRTL ? 'rtl' : 'ltr'} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, overflowWrap: 'anywhere' }}>
          {t('title').replace('{name}', name)}
        </h3>

        {transitions.length > 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{t('intro')}</p>
        )}

        <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {transitions.map(renderOption)}
          {renderOption('close')}
        </div>

        {isTransition && (
          <>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }}>
                {tLife('reason_label')} *
              </label>
              <textarea
                aria-label={tLife('reason_placeholder')}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={tLife('reason_placeholder')}
                rows={3}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13, resize: 'vertical',
                  border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }}>
                {tLife('date_label')} *
              </label>
              <DateInput value={date} onChange={setDate} locale={lang} maxDate={undefined} />
            </div>
          </>
        )}

        {choice === 'close' && (
          <div style={{ fontSize: 12.5, color: 'var(--danger)', background: 'var(--danger-tint)', padding: '8px 10px', borderRadius: 8 }}>
            {t('close_hint')} {t('confirm_question')}
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: 'var(--danger)', background: 'var(--danger-tint)', padding: '8px 10px', borderRadius: 8 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '8px 14px', fontSize: 13, color: 'var(--text)',
              background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer',
            }}
          >
            {tLife('cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !choice}
            style={{
              padding: '8px 14px', fontSize: 13, fontWeight: 500, color: '#fff',
              background: choice === 'close' ? 'var(--danger)' : 'var(--success)', border: 'none', borderRadius: 8,
              cursor: submitting || !choice ? 'default' : 'pointer', opacity: submitting || !choice ? 0.6 : 1,
            }}
          >
            {choice ? label[choice] : tLife('submit')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
