'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { requiredFieldMsg } from '@/lib/i18n/required'
import { Modal } from '@/components/ui/Modal'

interface Props {
  /** Предзаполненный заголовок. */
  defaultTitle?: string
  /** Предзаполненная дата 'YYYY-MM-DD' (иначе — сегодня на клиенте). */
  defaultDate?: string
  /** Предзаполненное время 'HH:MM'. */
  defaultTime?: string
  sourceType?: string
  sourceId?: string
  link?: string
  /** Компактная кнопка-ссылка вместо обычной. */
  variant?: 'button' | 'link'
  onAdded?: () => void
  /** Не рендерить собственную кнопку-триггер (диалог открывается извне). */
  hideTrigger?: boolean
  /** Пока значение меняется (>0) — открыть диалог. Для внешнего управления. */
  openSignal?: number
}

type ReminderOpt = 'none' | 'at' | '10m' | '1h' | '1d'

const OFFSETS: Record<Exclude<ReminderOpt, 'none'>, number> = {
  at: 0, '10m': 10 * 60_000, '1h': 60 * 60_000, '1d': 24 * 60 * 60_000,
}

/**
 * Универсальная кнопка «Добавить в календарь». Открывает диалог: заголовок,
 * дата, время (опц.), напоминание, заметки — и создаёт личное событие календаря
 * через POST /api/calendar/events (с вычисленным reminder_at). Встраивается на
 * задачи, заметки и куда угодно.
 */
export default function AddToCalendar({
  defaultTitle = '', defaultDate, defaultTime = '', sourceType = 'manual', sourceId, link, variant = 'button', onAdded,
  hideTrigger = false, openSignal = 0,
}: Props) {
  const t = useTranslations('add_to_calendar')
  const tCommon = useTranslations('common')

  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(defaultTitle)
  const [date, setDate] = useState(defaultDate ?? '')
  const [time, setTime] = useState(defaultTime)
  const [reminder, setReminder] = useState<ReminderOpt>('none')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<'added' | 'already' | null>(null)
  const [error, setError] = useState('')

  function todayISO(): string {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }

  function openDialog() {
    setTitle(defaultTitle)
    setDate(defaultDate ?? todayISO())
    setTime(defaultTime)
    setReminder('none')
    setNotes('')
    setDone(null); setError('')
    setOpen(true)
  }

  // Внешнее открытие диалога (из общего меню «добавить»).
  useEffect(() => {
    if (openSignal > 0) openDialog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal])

  function computeReminderAt(): string | null {
    if (reminder === 'none') return null
    const base = time ? new Date(`${date}T${time}:00`) : new Date(`${date}T09:00:00`)
    if (Number.isNaN(base.getTime())) return null
    return new Date(base.getTime() - OFFSETS[reminder]).toISOString()
  }

  async function save() {
    if (!title.trim()) { setError(requiredFieldMsg(tCommon, t('field_title'))); return }
    if (!date) { setError(requiredFieldMsg(tCommon, t('field_date'))); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          event_date: date,
          event_time: time || null,
          reminder_at: computeReminderAt(),
          notes: notes.trim() || null,
          source_type: sourceType,
          source_id: sourceId ?? null,
          link: link ?? null,
        }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { setError(b.error ?? t('error')); return }
      setDone(b.duplicate ? 'already' : 'added')
      onAdded?.()
      setTimeout(() => setOpen(false), 1100)
    } finally {
      setSaving(false)
    }
  }

  const REMINDERS: ReminderOpt[] = ['none', 'at', '10m', '1h', '1d']

  return (
    <>
      {hideTrigger ? null : variant === 'link' ? (
        <button onClick={openDialog} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          📅 {t('button')}
        </button>
      ) : (
        <button onClick={openDialog} style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-strong)', background: 'var(--accent-tint)', border: '1px solid var(--accent)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>
          📅 {t('button')}
        </button>
      )}

      {open && (
        <Modal
          onClose={() => !saving && setOpen(false)}
          maxWidth={440}
          zIndex={70}
          closeOnBackdrop
          panelStyle={{ padding: 20, boxShadow: 'var(--shadow-lg)', display: 'grid', gap: 12 }}
        >
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{t('title')}</div>

            {done ? (
              <div style={{ fontSize: 14, fontWeight: 600, color: done === 'added' ? 'var(--success)' : 'var(--text-muted)', padding: '12px 0', textAlign: 'center' }}>
                {done === 'added' ? t('added') : t('added_already')}
              </div>
            ) : (
              <>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={fieldLabel}>{t('field_title')} *</span>
                  <input value={title} onChange={e => setTitle(e.target.value)} style={inp} />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span style={fieldLabel}>{t('field_date')} *</span>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
                  </label>
                  <label style={{ display: 'grid', gap: 4 }}>
                    <span style={fieldLabel}>{t('field_time')}</span>
                    <input type="time" value={time} onChange={e => setTime(e.target.value)} style={inp} />
                  </label>
                </div>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={fieldLabel}>{t('field_reminder')}</span>
                  <select value={reminder} onChange={e => setReminder(e.target.value as ReminderOpt)} style={{ ...inp, cursor: 'pointer' }}>
                    {REMINDERS.map(r => <option key={r} value={r}>{t(`reminder_${r}`)}</option>)}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={fieldLabel}>{t('field_notes')}</span>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
                </label>

                {error && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</div>}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setOpen(false)} disabled={saving} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>{t('cancel')}</button>
                  <button onClick={save} disabled={saving} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: saving ? 'var(--text-faint)' : 'var(--accent-strong)', color: '#fff', cursor: saving ? 'default' : 'pointer' }}>
                    {saving ? t('saving') : t('save')}
                  </button>
                </div>
              </>
            )}
        </Modal>
      )}
    </>
  )
}

const fieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text)' }
const inp: React.CSSProperties = { fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, width: '100%', boxSizing: 'border-box' }
