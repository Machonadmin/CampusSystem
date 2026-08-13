'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Props {
  journeyId: string
  canManage: boolean
}

/**
 * Панель флага «нужен пансион» (needs_dormitory) на карточке лида/абитуриентки.
 * Самодостаточна: читает текущее значение через GET journey, пишет через PATCH.
 * PATCH на сервере запускает acceptance_apply_dormitory_gating — этапы
 * врача/психолога/общежития приводятся в соответствие с флагом. Трёхсостоятельно:
 * true / false / null («ещё не решено»).
 */
export default function DormitoryFlagPanel({ journeyId, canManage }: Props) {
  const t = useTranslations('education')
  const [value, setValue] = useState<boolean | null | undefined>(undefined) // undefined = загрузка
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    fetch(`/api/education/journeys/${journeyId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setValue(d ? (d.needs_dormitory ?? null) : null) })
      .catch(() => { if (alive) setValue(null) })
    return () => { alive = false }
  }, [journeyId])

  async function choose(next: boolean) {
    if (!canManage || saving) return
    // Повторный клик по уже выбранному — снять решение (вернуть в «не решено»).
    const target: boolean | null = value === next ? null : next
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ needs_dormitory: target }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        setError(d?.error || 'error')
        return
      }
      setValue(target)
      setFlash(true)
      setTimeout(() => setFlash(false), 2000)
    } catch {
      setError('error')
    } finally {
      setSaving(false)
    }
  }

  if (value === undefined) return null // не мигаем пустой панелью во время загрузки

  const btn = (active: boolean, tone: 'yes' | 'no') => ({
    flex: 1,
    padding: '7px 12px',
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    cursor: canManage && !saving ? 'pointer' : 'default',
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: active
      ? (tone === 'yes' ? 'var(--accent-tint)' : 'var(--surface-2)')
      : 'var(--surface)',
    color: active
      ? (tone === 'yes' ? 'var(--accent-strong)' : 'var(--text)')
      : 'var(--text-faint)',
    opacity: !canManage && !active ? 0.6 : 1,
    transition: 'background 0.15s, color 0.15s',
  } as React.CSSProperties)

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {t('card.dormitory.title', 'Пансион')}
        </div>
        {flash && (
          <span style={{ fontSize: 11, color: 'var(--accent-strong)' }}>{t('card.dormitory.updated', 'Обновлено')}</span>
        )}
      </div>

      <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8 }}>
        {t('card.dormitory.question', 'Нужен пансион?')}
        {value === null && (
          <span style={{ fontSize: 12, color: 'var(--text-faint)', marginInlineStart: 8 }}>
            · {t('card.dormitory.undecided', 'Не решено')}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={!canManage || saving} onClick={() => choose(true)} style={btn(value === true, 'yes')}>
          {t('card.dormitory.needed', 'Нужен')}
        </button>
        <button type="button" disabled={!canManage || saving} onClick={() => choose(false)} style={btn(value === false, 'no')}>
          {t('card.dormitory.not_needed', 'Не нужен')}
        </button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.4 }}>
        {t('card.dormitory.hint', 'Активирует этапы врача и психолога; если пансион не нужен — этап общежития пропускается.')}
      </div>

      {error && (
        <div style={{ fontSize: 12, color: 'var(--danger, #DC2626)', marginTop: 6 }}>{error}</div>
      )}
    </div>
  )
}
