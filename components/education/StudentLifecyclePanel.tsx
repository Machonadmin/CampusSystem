'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DateInput } from '@/components/ui/date-input'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StatusHistoryEntry {
  from_status: string | null
  to_status: string
  changed_at: string
  comment: string | null
}

interface Props {
  journeyId: string
  currentStatus: string | null
  canManage: boolean
  history: StatusHistoryEntry[]
}

type TargetStatus = 'on_leave' | 'student' | 'graduated' | 'expelled'

/** Переходы, разрешённые из текущего статуса (зеркалит RPC transition_education_status). */
const TRANSITIONS: Record<string, TargetStatus[]> = {
  student: ['on_leave', 'graduated', 'expelled'],
  on_leave: ['student'],
}

/** Переходы, требующие причину + дату (отрицательные/финальные). */
const NEEDS_DETAILS: TargetStatus[] = ['on_leave', 'graduated', 'expelled']

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  student:   { background: '#ECFDF5', color: '#065F46' },
  on_leave:  { background: '#FFFBEB', color: '#92400E' },
  graduated: { background: 'var(--accent-tint)', color: '#1E40AF' },
  expelled:  { background: 'var(--surface-2)', color: 'var(--text-muted)' },
}

const ACTION_STYLE: Record<TargetStatus, React.CSSProperties> = {
  on_leave:  { color: '#92400E', borderColor: '#FCD34D', background: '#FFFBEB' },
  student:   { color: '#065F46', borderColor: '#6EE7B7', background: '#ECFDF5' },
  graduated: { color: '#1E40AF', borderColor: '#93C5FD', background: 'var(--accent-tint)' },
  expelled:  { color: '#B91C1C', borderColor: '#FCA5A5', background: '#FEF2F2' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StudentLifecyclePanel({ journeyId, currentStatus, canManage, history }: Props) {
  const router = useRouter()
  const t = useTranslations('education.card.lifecycle')
  const tStatus = useTranslations('education.card.status')
  const { lang, isRTL } = useLang()

  const [modalTarget, setModalTarget] = useState<TargetStatus | null>(null)
  const [reason, setReason] = useState('')
  const [date, setDate] = useState<Date | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = currentStatus ?? ''
  const available = TRANSITIONS[status] ?? []
  const isTerminal = available.length === 0

  const actionLabel: Record<TargetStatus, string> = {
    on_leave:  t('action_on_leave'),
    student:   t('action_return'),
    graduated: t('action_graduate'),
    expelled:  t('action_expel'),
  }

  async function runTransition(to: TargetStatus, payload: { reason?: string; effective_date?: string }) {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_status: to, ...payload }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? t('error_generic'))
        return false
      }
      setModalTarget(null)
      setReason('')
      setDate(null)
      router.refresh()
      return true
    } catch {
      setError(t('error_generic'))
      return false
    } finally {
      setSubmitting(false)
    }
  }

  function onActionClick(to: TargetStatus) {
    setError(null)
    if (NEEDS_DETAILS.includes(to)) {
      setReason('')
      setDate(null)
      setModalTarget(to)
    } else {
      // Возврат из отпуска — без причины/даты
      if (confirm(t('return_confirm'))) void runTransition(to, {})
    }
  }

  async function onModalSubmit() {
    if (!modalTarget) return
    if (!reason.trim()) { setError(t('error_reason_required')); return }
    if (!date) { setError(t('error_date_required')); return }
    await runTransition(modalTarget, {
      reason: reason.trim(),
      effective_date: date.toISOString().slice(0, 10),
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Текущий статус */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('current_label')}:</span>
        <span style={{
          fontSize: 12, padding: '3px 10px', borderRadius: 99, fontWeight: 600, whiteSpace: 'nowrap',
          ...(STATUS_STYLE[status] ?? { background: 'var(--surface-2)', color: 'var(--text-muted)' }),
        }}>
          {tStatus(status, status)}
        </span>
      </div>

      {/* Кнопки переходов */}
      {canManage && !isTerminal && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {available.map(to => (
            <button
              key={to}
              onClick={() => onActionClick(to)}
              disabled={submitting}
              style={{
                padding: '7px 14px', fontSize: 13, fontWeight: 500,
                border: '1px solid', borderRadius: 8, cursor: submitting ? 'default' : 'pointer',
                ...ACTION_STYLE[to],
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {actionLabel[to]}
            </button>
          ))}
        </div>
      )}

      {canManage && isTerminal && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('terminal_note')}</div>
      )}

      {/* Ошибка (для прямых переходов без модалки) */}
      {error && !modalTarget && (
        <div style={{ fontSize: 12, color: '#B91C1C', background: '#FEF2F2', padding: '8px 10px', borderRadius: 8 }}>
          {error}
        </div>
      )}

      {/* История статусов */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          {t('history_title')}
        </div>
        {history.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('no_history')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((h, idx) => (
              <div key={idx} style={{ fontSize: 13, color: 'var(--text)', borderInlineStart: '2px solid var(--border)', paddingInlineStart: 10 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {h.from_status && (
                    <>
                      <span style={{ color: 'var(--text-faint)' }}>{tStatus(h.from_status, h.from_status)}</span>
                      <span style={{ color: 'var(--border-strong)' }}>→</span>
                    </>
                  )}
                  <span style={{ fontWeight: 500 }}>{tStatus(h.to_status, h.to_status)}</span>
                  <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>· {formatDate(h.changed_at)}</span>
                </div>
                {h.comment && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{h.comment}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Модалка перехода (причина + дата) */}
      {modalTarget && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
          onClick={() => { if (!submitting) setModalTarget(null) }}
        >
          <div
            dir={isRTL ? 'rtl' : 'ltr'}
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420,
              boxShadow: '0 10px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
              {t('modal_title')}: {tStatus(modalTarget, modalTarget)}
            </h3>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }}>
                {t('reason_label')} *
              </label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t('reason_placeholder')}
                rows={3}
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13, resize: 'vertical',
                  border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }}>
                {t('date_label')} *
              </label>
              <DateInput value={date} onChange={setDate} locale={lang} maxDate={undefined} />
            </div>

            {error && (
              <div style={{ fontSize: 12, color: '#B91C1C', background: '#FEF2F2', padding: '8px 10px', borderRadius: 8 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button
                onClick={() => setModalTarget(null)}
                disabled={submitting}
                style={{
                  padding: '8px 14px', fontSize: 13, color: 'var(--text)',
                  background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer',
                }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={onModalSubmit}
                disabled={submitting}
                style={{
                  padding: '8px 14px', fontSize: 13, fontWeight: 500, color: '#fff',
                  background: '#059669', border: 'none', borderRadius: 8,
                  cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1,
                }}
              >
                {t('submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
