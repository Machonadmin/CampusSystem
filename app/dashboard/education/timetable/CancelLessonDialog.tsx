'use client'

import { useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Modal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { toast } from '@/components/ui/toast'
import { localISODate, localTodayISO } from '@/lib/dates'

/**
 * Отмена ОДНОГО занятия повторяющегося слота.
 *
 * Сетка расписания показывает ШАБЛОНЫ (class_schedule_slots) — у них нет даты,
 * и «отменить» их нельзя: отменяется всегда конкретный урок (lessons) на
 * конкретную дату. Поэтому здесь спрашивается дата, а сам слот остаётся жить:
 * следующая неделя идёт своим чередом (решение владельца — по одной дате за раз).
 *
 * Урок на эту дату может ещё не существовать (уроки материализуются отдельным
 * действием «сгенерировать»). Тогда он сначала создаётся, затем помечается
 * отменённым — отдельный эндпоинт для этого не нужен, обоих существующих хватает.
 */

/** Ближайшая дата с нужным днём недели (ISO 1=Пн..7=Вс), включая сегодня. */
export function nextOccurrenceISO(dayOfWeek: number, fromISO: string = localTodayISO()): string {
  const d = new Date(`${fromISO}T00:00:00`)
  for (let i = 0; i < 7; i++) {
    const iso = d.getDay() === 0 ? 7 : d.getDay()
    if (iso === dayOfWeek) return localISODate(d)
    d.setDate(d.getDate() + 1)
  }
  return fromISO
}

interface Props {
  slot: {
    id: string
    class_group_id: string
    class_group_name: string
    day_of_week: number
    start_time: string
  }
  accentColor: string
  onClose: () => void
  onDone: (dateISO: string) => void
}

export default function CancelLessonDialog({ slot, accentColor, onClose, onDone }: Props) {
  const t = useTranslations('education.timetable')
  const tCommon = useTranslations('common')

  const [date, setDate] = useState(() => nextOccurrenceISO(slot.day_of_week))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hhmm = (v: string) => (v.length >= 5 ? v.slice(0, 5) : v)

  async function submit() {
    if (!date) { setError(t('cancel_date_required', 'בחר תאריך')); return }
    setBusy(true)
    setError(null)
    try {
      // 1. Есть ли уже урок на эту дату и время. Отдельного поиска по
      // дате+времени в API нет, поэтому берём уроки группы и ищем на клиенте.
      const listResp = await fetch(`/api/education/class-groups/${slot.class_group_id}/lessons`)
      if (!listResp.ok) {
        const b = await listResp.json().catch(() => ({}))
        setError(b.error ?? t('cancel_failed', 'לא הצלחנו לבטל את השיעור'))
        return
      }
      const listBody = await listResp.json()
      const want = hhmm(slot.start_time)
      const existing = ((listBody.lessons ?? []) as Array<{ id: string; scheduled_date: string; scheduled_time: string | null; is_cancelled?: boolean }>)
        .find(l => l.scheduled_date === date && hhmm(l.scheduled_time ?? '') === want)

      if (existing?.is_cancelled) {
        toast(t('cancel_already', 'השיעור כבר מבוטל'), 'info')
        onDone(date)
        return
      }

      // 2. Урока ещё нет — создаём его, чтобы было что отменять.
      let lessonId = existing?.id
      if (!lessonId) {
        const createResp = await fetch(`/api/education/class-groups/${slot.class_group_id}/lessons`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduled_date: date, scheduled_time: want }),
        })
        const created = await createResp.json().catch(() => ({}))
        if (!createResp.ok) {
          setError(created.error ?? t('cancel_failed', 'לא הצלחנו לבטל את השיעור'))
          return
        }
        lessonId = created.id as string
      }

      // 3. Помечаем отменённым. Сам слот НЕ трогаем — шаблон продолжает жить.
      const patchResp = await fetch(`/api/education/lessons/${lessonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_cancelled: true }),
      })
      if (!patchResp.ok) {
        const b = await patchResp.json().catch(() => ({}))
        setError(b.error ?? t('cancel_failed', 'לא הצלחנו לבטל את השיעור'))
        return
      }

      toast(t('cancel_ok', 'השיעור בוטל בתאריך {date}').replace('{date}', date), 'success')
      onDone(date)
    } catch {
      setError(t('cancel_failed', 'לא הצלחנו לבטל את השיעור'))
    } finally {
      setBusy(false)
    }
  }

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }

  return (
    <Modal onClose={onClose} maxWidth={380} closeOnBackdrop panelStyle={{ padding: 24 }} ariaLabel={t('cancel_title', 'ביטול שיעור')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{t('cancel_title', 'ביטול שיעור')}</h2>
        <button onClick={onClose} aria-label={tCommon('close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 12px' }}>
        {t('cancel_hint', 'מבטל רק את התאריך שנבחר. השיעור השבועי נשאר.')}
      </p>

      <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 12 }}>
        <strong>{slot.class_group_name}</strong> · {hhmm(slot.start_time)}
      </div>

      <div>
        <label style={labelStyle} htmlFor="cancel-lesson-date">{t('cancel_date_label', 'תאריך')}</label>
        <input
          id="cancel-lesson-date"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, boxSizing: 'border-box', outline: 'none' }}
        />
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
        <button
          onClick={onClose} disabled={busy}
          style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}
        >
          {tCommon('cancel')}
        </button>
        <SubmitButton
          onClick={submit} loading={busy}
          style={{ padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff', background: accentColor, border: 'none', borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.55 : 1 }}
        >
          {t('cancel_confirm', 'בטל את השיעור')}
        </SubmitButton>
      </div>
    </Modal>
  )
}
