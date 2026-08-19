'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'

/**
 * Панель учебного плана студентки: קבוצת כניסה (entry_group) + משך לימודים
 * (expected_duration_years). Редактирует ответственный руководитель (canEdit =
 * manage_students). Не показывает ошибку, если таблицы ещё нет — просто «не задан».
 */
const ENTRY_GROUPS = ['after_9', 'above_11'] as const
const DURATIONS = [2, 3, 4] as const

export default function StudyPlanPanel({ journeyId, canEdit }: { journeyId: string; canEdit: boolean }) {
  const t = useTranslations('education')

  const [entryGroup, setEntryGroup] = useState<string | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/study-plan`)
      if (res.ok) {
        const b = await res.json()
        setEntryGroup(b.plan?.entry_group ?? null)
        setDuration(b.plan?.expected_duration_years ?? null)
      }
    } catch { /* тихо */ }
    finally { setLoaded(true) }
  }, [journeyId])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/education/journeys/${journeyId}/study-plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_group: entryGroup, expected_duration_years: duration }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})) as { error?: string }; setError(d.error ?? t('study_plan.save_error')); return }
      setEditing(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null

  const selectStyle: React.CSSProperties = { fontSize: 13, padding: '8px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('study_plan.title')}</h3>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer' }}>
            {t('study_plan.edit')}
          </button>
        )}
      </div>

      {!editing ? (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 13 }}>
            <span style={{ color: 'var(--text-faint)' }}>{t('study_plan.entry_group')}: </span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{entryGroup ? t(`study_plan.group_${entryGroup}`) : t('study_plan.unassigned')}</span>
          </div>
          <div style={{ fontSize: 13 }}>
            <span style={{ color: 'var(--text-faint)' }}>{t('study_plan.duration')}: </span>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{duration ? t('study_plan.years', '{n}').replace('{n}', String(duration)) : t('study_plan.unassigned')}</span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{t('study_plan.entry_group')}</span>
            <select value={entryGroup ?? ''} onChange={e => setEntryGroup(e.target.value || null)} style={selectStyle}>
              <option value="">{t('study_plan.choose')}</option>
              {ENTRY_GROUPS.map(g => <option key={g} value={g}>{t(`study_plan.group_${g}`)}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{t('study_plan.duration')}</span>
            <select value={duration ?? ''} onChange={e => setDuration(e.target.value ? Number(e.target.value) : null)} style={selectStyle}>
              <option value="">{t('study_plan.choose')}</option>
              {DURATIONS.map(d => <option key={d} value={d}>{t('study_plan.years', '{n}').replace('{n}', String(d))}</option>)}
            </select>
          </label>
          {error && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: saving ? 'var(--text-faint)' : 'var(--accent-strong)', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: saving ? 'default' : 'pointer' }}>
              {saving ? t('study_plan.saving') : t('study_plan.save')}
            </button>
            <button onClick={() => { setEditing(false); load() }} disabled={saving} style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, padding: '8px 18px', cursor: 'pointer' }}>
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
