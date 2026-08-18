'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'

interface Semester {
  id: string
  name: string
  term_number: number | null
  tuition_amount: number | null
  sem_status: string | null
}

interface Props {
  subjectId: string
  subjectName: string
  onClose: () => void
}

const accent = getModuleColor('education')

/** מסך הסמסטרים של מקצוע — צפייה ועריכה של מחיר וסטטוס במקום אחד. */
export default function SubjectSemestersModal({ subjectId, subjectName, onClose }: Props) {
  const t = useTranslations('education.study')
  const [rows, setRows] = useState<Semester[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/education/semester-groups?subject_id=${subjectId}`)
      if (!resp.ok) throw new Error(t('common.error_generic'))
      const json = await resp.json()
      const list: Semester[] = (json.semester_groups ?? []).map((s: Semester) => ({
        id: s.id, name: s.name, term_number: s.term_number,
        tuition_amount: s.tuition_amount, sem_status: s.sem_status,
      }))
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error_unknown'))
    } finally {
      setLoading(false)
    }
  }, [subjectId, t])

  useEffect(() => { load() }, [load])

  function patchRow(id: string, patch: Partial<Semester>) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  async function save(row: Semester) {
    setSavingId(row.id)
    try {
      const resp = await fetch(`/api/education/semester-groups/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tuition_amount: row.tuition_amount ?? null,
          sem_status: row.sem_status ?? 'open',
        }),
      })
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}))
        toast(e.error ?? t('common.error_generic'), 'error')
        return
      }
      toast(t('subjects.sem_saved'), 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error_send_generic'), 'error')
    } finally {
      setSavingId(null)
    }
  }

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }
  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '1px solid var(--border-strong)', borderRadius: 8, boxSizing: 'border-box', outline: 'none',
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{t('subjects.semesters_title')}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{subjectName}</div>

        {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('common.loading')}</div>}
        {error && <div style={{ padding: 10, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 6, fontSize: 13 }}>{error}</div>}

        {!loading && !error && rows.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('subjects.sem_none')}</div>
        )}

        {!loading && !error && rows.map(row => (
          <div key={row.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
              {t('subjects.semester_word')} {row.term_number ?? '—'}
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 2, minWidth: 140 }}>
                <label style={lbl}>{t('subjects.semester_price_label')}</label>
                <input
                  type="number" min={0} style={inp}
                  value={row.tuition_amount ?? ''}
                  onChange={e => patchRow(row.id, { tuition_amount: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>
              <div style={{ flex: 1, minWidth: 110 }}>
                <label style={lbl}>{t('subjects.sem_status_label')}</label>
                <select
                  style={inp}
                  value={row.sem_status ?? 'open'}
                  onChange={e => patchRow(row.id, { sem_status: e.target.value })}
                >
                  <option value="open">{t('subjects.sem_open')}</option>
                  <option value="closed">{t('subjects.sem_closed')}</option>
                </select>
              </div>
              <button
                onClick={() => save(row)}
                disabled={savingId === row.id}
                style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, color: '#fff', background: accent, border: 'none', borderRadius: 8, cursor: savingId === row.id ? 'wait' : 'pointer', opacity: savingId === row.id ? 0.6 : 1 }}
              >
                {savingId === row.id ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
