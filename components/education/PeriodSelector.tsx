'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface PeriodItem { yearLabel: string; term: number | null; key: string; is_past?: boolean }

/**
 * Глобальный бор периода (год+семестр) с read-only для ПРОШЕДШИХ периодов
 * (spec §4.11, решение архитектора): текущий период = семестр, чей диапазон дат
 * содержит сегодня; период с прошедшей датой окончания (is_past) → только чтение.
 * Выбор персистится в localStorage. Отдаёт наверх { selectedKey, readOnly }.
 * Deploy-safe: нет данных → ничего не рендерит.
 */
export default function PeriodSelector({
  onChange,
  storageKey = 'edu_period_key',
}: {
  onChange?: (state: { selectedKey: string | null; readOnly: boolean }) => void
  storageKey?: string
}) {
  const t = useTranslations('education.period')
  const [periods, setPeriods] = useState<PeriodItem[]>([])
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const isPast = (key: string | null) => !!periods.find(p => p.key === key)?.is_past
  const readOnly = isPast(selectedKey)

  const emit = useCallback((key: string | null, list: PeriodItem[]) => {
    onChange?.({ selectedKey: key, readOnly: !!list.find(p => p.key === key)?.is_past })
  }, [onChange])

  useEffect(() => {
    let stored: string | null = null
    try { stored = localStorage.getItem(storageKey) } catch { stored = null }
    fetch('/api/education/periods').then(async res => {
      if (!res.ok) return
      const b = await res.json() as { periods: PeriodItem[]; currentKey: string | null }
      const list = b.periods ?? []
      setPeriods(list)
      setCurrentKey(b.currentKey ?? null)
      const initial = (stored && list.some(p => p.key === stored)) ? stored : (b.currentKey ?? null)
      setSelectedKey(initial)
      emit(initial, list)
    }).catch(() => { /* тихо */ })
  }, [storageKey, emit])

  const pick = (key: string) => {
    setSelectedKey(key)
    try { localStorage.setItem(storageKey, key) } catch { /* приватный режим */ }
    emit(key, periods)
  }

  if (periods.length <= 1) return null

  const label = (p: PeriodItem) => p.term ? `${p.yearLabel} · ${t('term')} ${p.term}` : p.yearLabel

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('period_label')}</span>
      <select
        value={selectedKey ?? ''}
        onChange={e => pick(e.target.value)}
        style={{ fontSize: 12.5, padding: '5px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }}
      >
        {periods.map(p => (
          <option key={p.key} value={p.key}>{label(p)}{p.key === currentKey ? ` · ${t('current')}` : ''}</option>
        ))}
      </select>
      {readOnly && (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--warn)', background: 'var(--warn-tint)', border: '1px solid var(--warn)', borderRadius: 999, padding: '2px 10px' }}>
          {t('read_only')}
        </span>
      )}
    </div>
  )
}
