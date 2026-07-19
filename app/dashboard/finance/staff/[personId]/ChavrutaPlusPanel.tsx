'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'

interface Assignment {
  id: string
  student_journey_id: string
  student_name: string
  is_active: boolean
}
interface StudentOption { journey_id: string; name: string }

/**
 * Панель «Хеврута-плюс» (менторство) на карточке зарплаты сотрудника.
 * Менеджер добавляет/снимает постоянные пары мора↔ученица и начисляет за месяц
 * (per_student_month). Тариф/базис редактируются в блоке ставок выше — здесь
 * только показываем. Деплой-безопасно: 503 → скрываем панель.
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
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)

  const [students, setStudents] = useState<StudentOption[]>([])
  const [search, setSearch] = useState('')

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

  // Ленивая подгрузка списка учениц при первом открытии формы добавления.
  useEffect(() => {
    if (!adding || students.length > 0) return
    fetch('/api/finance/students')
      .then(r => r.ok ? r.json() : null)
      .then(b => {
        const list = (b?.students ?? []) as Array<{ journey_id: string; full_name?: string; hebrew_name?: string | null }>
        setStudents(list.map(s => ({ journey_id: s.journey_id, name: (s.full_name || s.hebrew_name || '').trim() })))
      })
      .catch(() => {/* ignore */})
  }, [adding, students.length])

  const activeJourneyIds = useMemo(() => new Set(assignments.filter(a => a.is_active).map(a => a.student_journey_id)), [assignments])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students
      .filter(s => !activeJourneyIds.has(s.journey_id))
      .filter(s => !q || s.name.toLowerCase().includes(q))
      .slice(0, 30)
  }, [students, search, activeJourneyIds])

  async function addAssignment(journeyId: string) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/staff-comp/${personId}/chavruta-plus`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_journey_id: journeyId }),
      })
      if (!res.ok) { toast(t('entry_save_error'), 'error'); return }
      setSearch(''); setAdding(false)
      await load()
    } catch { toast(t('entry_save_error'), 'error') }
    finally { setBusy(false) }
  }

  async function removeAssignment(id: string) {
    if (!window.confirm(t('cp_confirm_remove'))) return
    try {
      const res = await fetch(`/api/staff-comp/${personId}/chavruta-plus/${id}`, { method: 'DELETE' })
      if (!res.ok) { toast(t('entry_save_error'), 'error'); return }
      await load()
    } catch { toast(t('entry_save_error'), 'error') }
  }

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
              <button onClick={generate} disabled={generating}
                style={{ fontSize: 13, fontWeight: 600, padding: '7px 14px', border: `1px solid ${getModuleColor('finance', 'medium')}`, borderRadius: 8, background: getModuleColor('finance', 'light'), color: primary, cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.6 : 1 }}>
                {t('cp_generate')}
              </button>
            )}
            {!adding && (
              <button onClick={() => setAdding(true)}
                style={{ fontSize: 13, fontWeight: 600, padding: '7px 14px', border: 'none', borderRadius: 8, background: primary, color: '#fff', cursor: 'pointer' }}>
                + {t('cp_add')}
              </button>
            )}
          </div>
        )}
      </div>

      {basis === 'per_hour' && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 12 }}>{t('cp_per_hour_note')}</div>
      )}

      {adding && (
        <div style={{ marginBottom: 14, padding: 12, background: 'var(--surface-2)', borderRadius: 10 }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder={t('cp_search_placeholder')}
            style={{ width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text)', background: 'var(--surface)', boxSizing: 'border-box', outline: 'none' }} />
          <div style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 4 }}>
            {filtered.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '6px 4px' }}>—</div>
            ) : filtered.map(s => (
              <button key={s.journey_id} onClick={() => addAssignment(s.journey_id)} disabled={busy}
                style={{ textAlign: 'start', fontSize: 13, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', cursor: busy ? 'default' : 'pointer' }}>
                {s.name || s.journey_id}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <button onClick={() => { setAdding(false); setSearch('') }}
              style={{ fontSize: 12, padding: '5px 12px', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
          </div>
        </div>
      )}

      {active.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('cp_no_assignments')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {active.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{a.student_name || a.student_journey_id}</span>
              {canManage && (
                <button onClick={() => removeAssignment(a.id)} title={t('cp_remove')}
                  style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>× {t('cp_remove')}</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
