'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import PageActionButton from '@/components/ui/PageActionButton'
import SpecialtyModal from './SpecialtyModal'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { localizedDeptName } from '@/lib/departments/localized-name'
import { toast } from '@/components/ui/toast'

interface Department {
  id: string
  name: string
  name_he?: string | null
  name_en?: string | null
}

interface Specialty {
  id: string
  name: string
  code: string | null
  sort_order: number
  is_active: boolean
  department_id: string
  department: Department | null
  created_at: string
  updated_at: string
}

const accent = getModuleColor('education')

export default function SpecialtiesTab() {
  const t = useTranslations('education.study')
  const { lang } = useLang()
  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterDept, setFilterDept] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingSpecialty, setEditingSpecialty] = useState<Specialty | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)  // прогрессивное раскрытие: детали строки по клику

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [sResp, dResp] = await Promise.all([
        fetch(`/api/education/specialties?active_only=${showInactive ? 'false' : 'true'}`),
        fetch('/api/settings/departments'),
      ])
      if (!sResp.ok) throw new Error(t('specialties.load_error').replace('{status}', String(sResp.status)))
      if (!dResp.ok) throw new Error(t('common.error_generic'))
      const sJson = await sResp.json()
      const dJson = await dResp.json()
      setSpecialties(sJson.specialties ?? [])
      setDepartments(Array.isArray(dJson) ? dJson : (dJson.departments ?? []))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error_unknown'))
    } finally {
      setLoading(false)
    }
  }, [showInactive, t])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = async (spec: Specialty) => {
    if (!confirm(t('specialties.confirm_delete').replace('{name}', spec.name))) return
    try {
      const resp = await fetch(`/api/education/specialties/${spec.id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        toast(err.error ?? t('common.error_delete_failed'), 'error')
        return
      }
      loadData()
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error_delete_generic'), 'error')
    }
  }

  const handleSaved = () => {
    setModalMode(null)
    setEditingSpecialty(null)
    loadData()
  }

  const filtered = filterDept
    ? specialties.filter(s => s.department_id === filterDept)
    : specialties

  const inp: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none' }
  const btnSecondary: React.CSSProperties = {
    padding: '5px 10px', fontSize: 12, color: 'var(--text)',
    background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
  }

  return (
    <div>
      {/* Тулбар */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          value={filterDept}
          onChange={e => setFilterDept(e.target.value)}
          style={inp}
        >
          <option value="">{t('common.all_departments')}</option>
          {departments.map(d => (
            <option key={d.id} value={d.id}>{localizedDeptName(d, lang)}</option>
          ))}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
          />
          {t('common.show_inactive')}
        </label>

        <div style={{ flex: 1 }} />

        <PageActionButton
          label={t('specialties.add_button')}
          onClick={() => { setEditingSpecialty(null); setModalMode('create') }}
          accentColor={accent}
        />
      </div>

      {loading && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('common.loading')}</div>
      )}

      {error && (
        <div style={{ padding: 12, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
            {specialties.length === 0 ? t('specialties.empty_none') : t('common.nothing_found')}
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <th style={thStyle}>{t('specialties.table_name')}</th>
                  <th style={{ ...thStyle, width: 100 }}>{t('specialties.table_code')}</th>
                  <th style={thStyle}>{t('specialties.table_department')}</th>
                  <th style={{ ...thStyle, width: 100 }}>{t('specialties.table_status')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const open = expandedId === s.id
                  return (
                    <Fragment key={s.id}>
                      <tr
                        onClick={() => setExpandedId(open ? null : s.id)}
                        style={{ borderTop: '1px solid var(--surface-2)', cursor: 'pointer', background: open ? 'var(--surface-2)' : undefined }}
                        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                      >
                        <td style={{ ...tdStyle, fontWeight: 500 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ fontSize: 9, color: 'var(--text-faint)', transition: 'transform .15s', transform: `rotate(${open ? 90 : (lang === 'he' ? 180 : 0)}deg)` }}>▶</span>
                            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{s.name}</span>
                          </span>
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>
                          {s.code ?? <span style={{ color: 'var(--border-strong)' }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{s.department?.name ?? '—'}</td>
                        <td style={tdStyle}>
                          {s.is_active ? (
                            <span style={{ color: 'var(--success)', fontWeight: 500 }}>{t('specialties.status_active')}</span>
                          ) : (
                            <span style={{ color: 'var(--text-faint)' }}>{t('specialties.status_inactive')}</span>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr style={{ background: 'var(--surface-2)' }}>
                          <td colSpan={4} style={{ padding: '2px 16px 14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px 22px', paddingInlineStart: 16 }}>
                              <Detail label={t('specialties.table_sort_order')} value={String(s.sort_order)} />
                            </div>
                            <div style={{ display: 'flex', gap: 5, marginTop: 12, paddingInlineStart: 16, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => { setEditingSpecialty(s); setModalMode('edit') }} style={btnSecondary}>
                                {t('common.edit')}
                              </button>
                              <button
                                onClick={() => handleDelete(s)}
                                style={{ ...btnSecondary, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                              >
                                {t('common.delete')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {modalMode && (
        <SpecialtyModal
          mode={modalMode}
          initial={editingSpecialty}
          departments={departments}
          onClose={() => { setModalMode(null); setEditingSpecialty(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', fontWeight: 600, color: 'var(--text)',
  textAlign: 'start', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '10px 12px', color: 'var(--text)' }

// Пара «метка → значение» в раскрытой панели деталей строки.
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}
