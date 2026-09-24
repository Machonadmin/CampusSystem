'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import { SubmitButton } from '@/components/ui/SubmitButton'

interface Assignment {
  id: string
  student_journey_id: string
  student_name: string
  is_active: boolean
}

/**
 * Панель «Хеврута-плюс» на карточке зарплаты сотрудника — пары ТОЛЬКО ЧТЕНИЕ.
 * Решение владельца #6: пары мора↔ученица ведутся только в «מרכז חברותא»
 * (/dashboard/education/chavruta, chavruta_pairs) — здесь список и ссылка туда.
 * Финансы только начисляют за месяц (per_student_month); тариф/базис —
 * в блоке ставок выше. Деплой-безопасно: 503 → скрываем панель.
 */
export default function ChavrutaPlusPanel({ personId, canManage, year, month, onGenerated }: {
  personId: string
  canManage: boolean
  year: number
  month: number
  onGenerated: () => void
}) {
  const t = useTranslations('finance.staff')
  const primary = getModuleColor('finance', 'primary')

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [basis, setBasis] = useState('per_student_month')
  const [loaded, setLoaded] = useState(false)
  const [hidden, setHidden] = useState(false)   // 503 / нет фичи
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/staff-comp/${personId}/chavruta-plus`)
      if (res.status === 503) { setHidden(true); return }
      if (!res.ok) return
      const b = await res.json()
      setAssignments(b?.assignments ?? [])
      setBasis(b?.basis ?? 'per_student_month')
    } catch { /* ignore */ }
    finally { setLoaded(true) }
  }, [personId])

  useEffect(() => { load() }, [load])

  async function generate() {
    if (generating) return
    setGenerating(true)
    try {
      const res = await fetch(`/api/staff-comp/${personId}/generate-chavruta-plus?year=${year}&month=${month}`, { method: 'POST' })
      if (!res.ok) { toast(t('entry_save_error'), 'error'); return }
      const b = await res.json()
      toast(t('generate_result').replace('{created}', String(b.created ?? 0)).replace('{skipped}', String(b.skipped ?? 0)), 'success')
      onGenerated()
    } catch { toast(t('entry_save_error'), 'error') }
    finally { setGenerating(false) }
  }

  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }
  const cardTitle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }

  if (hidden || !loaded) return null
  const active = assignments.filter(a => a.is_active)

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={cardTitle}>{t('cp_title')}</div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            {basis === 'per_student_month' && (
              <SubmitButton onClick={generate} loading={generating}
                style={{ fontSize: 13, fontWeight: 600, padding: '7px 14px', border: `1px solid ${getModuleColor('finance', 'medium')}`, borderRadius: 8, background: getModuleColor('finance', 'light'), color: primary, cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.6 : 1 }}>
                {t('cp_generate')}
              </SubmitButton>
            )}
          </div>
        )}
      </div>

      {basis === 'per_hour' && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 12 }}>{t('cp_per_hour_note')}</div>
      )}

      <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>{t('cp_readonly_hint')}</span>
        <Link href="/dashboard/education/chavruta" style={{ fontWeight: 600, color: 'var(--accent-strong)' }}>{t('cp_manage_link')}</Link>
      </div>

      {active.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('cp_no_assignments')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {active.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{a.student_name || a.student_journey_id}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
