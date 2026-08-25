'use client'

import { useEffect, useRef, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { roleLabel } from '@/lib/roles/role-label'
import { isDeprecatedRole } from '@/lib/roles/deprecated'
import { localizedDeptName } from '@/lib/departments/localized-name'
import { toast } from '@/components/ui/toast'
import { Modal } from '@/components/ui/Modal'
import { SubmitButton } from '@/components/ui/SubmitButton'

interface Dept { id: string; name: string; name_he?: string | null; name_en?: string | null }
interface Position { id: string; name_ru: string; name_he: string | null; category: string; is_teaching: boolean }
interface Role { id: string; code: string; name: string; category: string }
interface PersonResult { id: string; full_name: string; email: string | null }

const accent = getModuleColor('staff')

// Роли, которые обычно «сажают» на стул (показываем первыми).
const PRIMARY_ROLE_CODES = ['unit_manager', 'unit_secretary', 'teacher', 'campus_president']

export default function SeatPersonModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('staff')
  const { lang, t: langT } = useLang()

  const [depts, setDepts] = useState<Dept[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [roles, setRoles] = useState<Role[]>([])

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PersonResult[]>([])
  const [person, setPerson] = useState<PersonResult | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [deptId, setDeptId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [roleId, setRoleId] = useState('')
  const [isHead, setIsHead] = useState(false)
  const [hireDate, setHireDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/departments').then(r => r.ok ? r.json() : []),
      fetch('/api/settings/positions?active_only=true').then(r => r.ok ? r.json() : { positions: [] }),
      fetch('/api/settings/roles').then(r => r.ok ? r.json() : []),
    ]).then(([d, p, rl]) => {
      setDepts(Array.isArray(d) ? d : (d.departments ?? []))
      setPositions(p.positions ?? [])
      setRoles(Array.isArray(rl) ? rl : [])
    }).catch(() => {})
  }, [])

  function search(q: string) {
    setQuery(q)
    setPerson(null)
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) { setResults([]); return }
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/settings/persons/search?q=${encodeURIComponent(q.trim())}`)
      if (r.ok) setResults(await r.json())
    }, 300)
  }

  const positionLabel = (p: Position) => (lang === 'he' ? (p.name_he || p.name_ru) : p.name_ru)
  // Модель рензе: legacy-роли не предлагаем к новому назначению (см. lib/roles/deprecated).
  const sortedRoles = [...roles].filter(r => !isDeprecatedRole(r.code)).sort((a, b) => {
    const ia = PRIMARY_ROLE_CODES.indexOf(a.code); const ib = PRIMARY_ROLE_CODES.indexOf(b.code)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    return 0
  })

  async function submit() {
    if (!person) { setError(t('seat_err_person')); return }
    if (!deptId) { setError(t('seat_err_department')); return }
    if (!positionId) { setError(t('seat_err_position')); return }
    if (!roleId) { setError(t('seat_err_role')); return }
    setSaving(true); setError(null)
    try {
      const resp = await fetch('/api/staff/seat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_id: person.id, department_id: deptId, position_id: positionId,
          role_id: roleId, is_head: isHead, hire_date: hireDate || null,
        }),
      })
      if (!resp.ok) { const e = await resp.json().catch(() => ({})); setError(e.error ?? t('seat_err_generic')); return }
      toast(t('seat_saved'), 'success')
      onSaved()
    } finally { setSaving(false) }
  }

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }
  const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, boxSizing: 'border-box', outline: 'none' }

  return (
    <Modal onClose={onClose} maxWidth={500} closeOnBackdrop panelStyle={{ borderRadius: 14, padding: 24, maxHeight: '88vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{t('seat_title')}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '0 0 16px' }}>{t('seat_hint')}</p>

        {/* Person */}
        <div style={{ marginBottom: 12, position: 'relative' }}>
          <label style={lbl}>{t('seat_person')} *</label>
          {person ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent-tint)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{person.full_name}</div>
                {person.email && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{person.email}</div>}
              </div>
              <button onClick={() => { setPerson(null); setQuery('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 18 }}>×</button>
            </div>
          ) : (
            <>
              <input value={query} onChange={e => search(e.target.value)} placeholder={t('seat_search_person')} style={inp} autoFocus />
              {results.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', insetInline: 0, zIndex: 5, background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
                  {results.map(r => (
                    <button key={r.id} onClick={() => { setPerson(r); setResults([]) }} style={{ display: 'block', width: '100%', textAlign: 'start', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
                      {r.full_name}{r.email ? ` · ${r.email}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Department + Position */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={lbl}>{t('seat_department')} *</label>
            <select value={deptId} onChange={e => setDeptId(e.target.value)} style={inp}>
              <option value="">{t('seat_choose')}</option>
              {depts.map(d => <option key={d.id} value={d.id}>{localizedDeptName(d, lang)}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label style={lbl}>{t('seat_position')} *</label>
            <select value={positionId} onChange={e => setPositionId(e.target.value)} style={inp}>
              <option value="">{t('seat_choose')}</option>
              {positions.map(p => <option key={p.id} value={p.id}>{positionLabel(p)}</option>)}
            </select>
          </div>
        </div>

        {/* Role */}
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>{t('seat_role')} *</label>
          <select value={roleId} onChange={e => setRoleId(e.target.value)} style={inp}>
            <option value="">{t('seat_choose')}</option>
            {sortedRoles.map(r => <option key={r.id} value={r.id}>{roleLabel(langT.roles, r.code, r.name)}</option>)}
          </select>
        </div>

        {/* is_head + hire date */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', flex: '1 1 220px' }}>
            <input type="checkbox" checked={isHead} onChange={e => setIsHead(e.target.checked)} />
            {t('seat_is_head')}
          </label>
          <div style={{ flex: '1 1 160px' }}>
            <label style={lbl}>{t('seat_hire_date')}</label>
            <input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} style={inp} />
          </div>
        </div>

        {error && <div style={{ padding: 10, marginBottom: 12, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8, fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}>{t('cancel')}</button>
          <SubmitButton loading={saving} loadingLabel={t('seat_saving')} onClick={submit} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, color: '#fff', background: accent, border: 'none', borderRadius: 8, opacity: saving ? 0.6 : 1 }}>
            {t('seat_submit')}
          </SubmitButton>
        </div>
    </Modal>
  )
}
