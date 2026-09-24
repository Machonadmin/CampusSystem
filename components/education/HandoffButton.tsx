'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { formatDate } from '@/lib/i18n/format-date'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { useSafeBack } from '@/lib/hooks/useSafeBack'
import { EDUCATION_SECTION_ROUTES } from '@/lib/education/education-hub'

/**
 * Заметная кнопка «Передать в приёмную комиссию» на карточке лида. Показывается
 * только когда у лида есть активный этап «Набора» с финалом convert_to_applicant
 * и пользователь вправе конвертировать. Блокируется, пока не заполнены
 * обязательные поля (имя, телефон), показывая, чего не хватает. Действие идёт
 * через общий complete-эндпоинт (convert_to_applicant → приём + задачи + уведомления).
 */
export default function HandoffButton({ journeyId }: { journeyId: string }) {
  const t = useTranslations('education')
  const { lang } = useLang()
  const router = useRouter()
  const goBack = useSafeBack(EDUCATION_SECTION_ROUTES.recruitment)

  const [stageId, setStageId] = useState<string | null>(null)
  const [missing, setMissing] = useState<string[]>([])
  const [hasProcess, setHasProcess] = useState(true)
  const [lastClosed, setLastClosed] = useState<{ finished_at: string | null; finish_reason: string | null } | null>(null)
  const [eduStatus, setEduStatus] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/handoff`)
      if (!res.ok) { setLoaded(true); return }
      const b = await res.json()
      setStageId(b.stage_instance_id ?? null)
      setMissing(b.missing ?? [])
      // has_active_process отсутствует до деплоя этой версии API → считаем, что
      // процесс есть, и ведём себя как раньше (не предлагаем запуск вслепую).
      setHasProcess(b.has_active_process ?? true)
      setLastClosed(b.last_closed ?? null)
      setEduStatus(b.education_status ?? null)
    } catch { /* тихо */ }
    finally { setLoaded(true) }
  }, [journeyId])

  useEffect(() => { load() }, [load])

  /**
   * Запустить «Набор» для лида, у которого процесса нет. Два случая: автостарт
   * при создании лида упал (тогда карточка вообще мертва), и «второй шанс»
   * лиду, чей набор закрыли отказом.
   */
  async function startProcess() {
    setStarting(true); setError('')
    try {
      const res = await fetch(`/api/workflow/journeys/${journeyId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ process_code: 'recruitment' }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? t('handoff.start_error'))
        return
      }
      await load()
      router.refresh()
    } finally {
      setStarting(false)
    }
  }

  async function handoff() {
    if (!stageId || missing.length > 0) return
    if (!(await confirmDialog({ message: t('handoff.confirm'), tone: 'default' }))) return
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/workflow/stages/${stageId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_code: 'convert_to_applicant' }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? t('handoff.error')); return }
      // После конверсии лид становится מועמדת. Тот, кто конвертировал (напр.
      // рекрутёр), может НЕ иметь права смотреть карточку абитуриентки —
      // router.refresh() перезагрузил бы эту же страницу как карточку
      // абитуриентки и упал бы в 403 (Server Components render → error boundary).
      // Поэтому уходим с карточки, а не обновляем на месте: назад туда, откуда
      // пришли (обычно список גיוס), без истории — в список גיוס (не на хаб
      // «חינוך»).
      goBack()
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return null

  // Девушка уже не лид (её перевели) — блока быть не должно вообще: ни кнопки
  // передачи, ни предложения «запустить набор заново». Родительская карточка
  // тоже это проверяет, но её status приходит из Server Component и после
  // конверсии остаётся устаревшим в Router Cache; этот ответ всегда свежий.
  // education_status === null — старая версия API: ведём себя как раньше.
  if (eduStatus !== null && eduStatus !== 'lead') return null

  // Этап конверсии ещё не активен. Две разные причины, и до этой правки обе
  // показывали одну и ту же подсказку — в том числе случай «процесса нет
  // вообще», из которого карточка не выбиралась вообще никак.
  if (!stageId) {
    const canStart = !hasProcess
    return (
      <div style={{ background: 'var(--surface)', border: '1px dashed var(--border-strong)', borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)' }}>→ {t('handoff.button')}</div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6, lineHeight: 1.5 }}>
          {canStart
            ? (lastClosed ? t('handoff.process_closed') : t('handoff.no_process'))
            : t('handoff.not_ready')}
        </div>
        {canStart && lastClosed?.finished_at && (
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>
            {formatDate(lastClosed.finished_at, lang)}
            {lastClosed.finish_reason
              ? ` · ${t(`process.finals.${lastClosed.finish_reason}`, lastClosed.finish_reason)}`
              : ''}
          </div>
        )}
        {canStart && (
          <button
            onClick={startProcess}
            disabled={starting}
            style={{
              marginTop: 12, width: '100%', padding: '10px', fontSize: 14, fontWeight: 600,
              color: 'var(--accent-contrast)', background: 'var(--accent)',
              border: 'none', borderRadius: 10, cursor: starting ? 'not-allowed' : 'pointer',
              opacity: starting ? 0.6 : 1,
            }}
          >
            {starting
              ? t('handoff.starting')
              : (lastClosed ? t('handoff.restart_process') : t('handoff.start_process'))}
          </button>
        )}
        {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8, textAlign: 'center' }}>{error}</div>}
      </div>
    )
  }

  const ready = missing.length === 0
  const missingLabels = missing.map(m => m === 'name' ? t('handoff.field_name') : m === 'phone' ? t('handoff.field_phone') : m)

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
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
