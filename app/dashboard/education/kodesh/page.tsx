'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'

interface Group { id: string; name: string }
interface Student {
  journey_id: string
  name: string
  department: string | null
  kodesh_group_id: string | null
}

export default function KodeshAssignmentPage() {
  const t = useTranslations('education.kodesh')
  const tNav = useTranslations('navigation')

  const [groups, setGroups] = useState<Group[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [noAccess, setNoAccess] = useState(false)
  const [onlyUnassigned, setOnlyUnassigned] = useState(false)
  const [genBusy, setGenBusy] = useState(false)
  const [genMsg, setGenMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setErr(null); setNoAccess(false)
    try {
      const res = await fetch('/api/education/kodesh/assignment')
      if (res.status === 403) { setNoAccess(true); return }
      if (res.ok) {
        const b = await res.json()
        setGroups(b.groups ?? [])
        setStudents(b.students ?? [])
      }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const unassignedCount = useMemo(
    () => students.filter(s => s.kodesh_group_id === null).length,
    [students],
  )
  const visible = useMemo(
    () => onlyUnassigned ? students.filter(s => s.kodesh_group_id === null) : students,
    [students, onlyUnassigned],
  )

  const assign = async (journeyId: string, rawValue: string) => {
    const groupId = rawValue === '' ? null : rawValue
    const prev = students
    setBusyId(journeyId); setErr(null)
    // Оптимистичное обновление.
    setStudents(list => list.map(s => s.journey_id === journeyId ? { ...s, kodesh_group_id: groupId } : s))
    try {
      const res = await fetch('/api/education/kodesh/assignment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journey_id: journeyId, group_id: groupId }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setErr(b.error ?? t('save_failed'))
        setStudents(prev) // откат
      }
    } catch {
      setErr(t('save_failed'))
      setStudents(prev)
    } finally { setBusyId(null) }
  }

  // Разово породить уроки для ВСЕХ групп кодеша за их период (удобство: иначе
  // «Generate» нажимается в каждой группе отдельно). Строго добавляющее.
  const generateAll = async () => {
    if (groups.length === 0) return
    setGenBusy(true); setGenMsg(null); setErr(null)
    let created = 0, skipped = 0, failed = 0
    for (const g of groups) {
      try {
        const res = await fetch(`/api/education/class-groups/${g.id}/schedule/generate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        })
        if (res.ok) {
          const b = await res.json().catch(() => ({}))
          created += Number(b.created ?? 0); skipped += Number(b.skipped ?? 0)
        } else { failed++ }
      } catch { failed++ }
    }
    setGenBusy(false)
    setGenMsg(t('gen_all_result', '{created} · {skipped} · {failed}')
      .replace('{created}', String(created)).replace('{skipped}', String(skipped)).replace('{failed}', String(failed)))
  }

  if (noAccess) {
    return (
      <div className="p-6 space-y-5">
        <Breadcrumb items={[
          { label: tNav('home'), href: '/dashboard' },
          { label: tNav('education'), href: '/dashboard/education' },
          { label: t('title') },
        ]} />
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>{t('no_access')}</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '16px 24px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{t('title')}</h1>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{t('subtitle')}</p>
      </div>

      {err && <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{
              fontSize: 13, fontWeight: 700,
              color: unassignedCount > 0 ? 'var(--warn)' : 'var(--success)',
              background: unassignedCount > 0 ? 'var(--warn-tint)' : 'var(--success-tint)',
              border: `1px solid ${unassignedCount > 0 ? 'var(--warn)' : 'var(--success)'}`,
              borderRadius: 8, padding: '6px 12px',
            }}>
              {t('unassigned_count', '{n}').replace('{n}', String(unassignedCount))}
            </div>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyUnassigned} onChange={e => setOnlyUnassigned(e.target.checked)} />
              {onlyUnassigned ? t('only_unassigned') : t('all')}
            </label>
            <div style={{ flex: 1 }} />
            <button
              onClick={generateAll}
              disabled={genBusy || groups.length === 0}
              title={t('gen_all_hint', '')}
              style={{
                fontSize: 13, fontWeight: 600, padding: '7px 14px', borderRadius: 8,
                border: '1px solid var(--accent-strong)', background: 'var(--accent-tint)',
                color: 'var(--accent-strong)', cursor: genBusy || groups.length === 0 ? 'default' : 'pointer',
                opacity: genBusy || groups.length === 0 ? 0.55 : 1,
              }}
            >
              {genBusy ? t('gen_all_busy', '…') : t('gen_all', 'Generate all lessons')}
            </button>
          </div>

          {genMsg && (
            <div style={{ padding: '9px 13px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 13, color: 'var(--text)' }}>{genMsg}</div>
          )}

          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>
              <div style={{ flex: 1, minWidth: 160 }}>{t('student_col')}</div>
              <div style={{ minWidth: 180 }}>{t('group_col')}</div>
            </div>
            {visible.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>—</div>
            ) : visible.map((s, i) => {
              const unassigned = s.kodesh_group_id === null
              return (
                <div key={s.journey_id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '11px 14px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{s.name || '—'}</div>
                    {s.department && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{s.department}</div>}
                  </div>
                  <select
                    value={s.kodesh_group_id ?? ''}
                    disabled={busyId === s.journey_id}
                    onChange={e => assign(s.journey_id, e.target.value)}
                    style={{
                      minWidth: 180, padding: '7px 10px', fontSize: 13, borderRadius: 8,
                      border: `1px solid ${unassigned ? 'var(--warn)' : 'var(--border-strong)'}`,
                      background: 'var(--surface)', color: 'var(--text)',
                      opacity: busyId === s.journey_id ? 0.55 : 1,
                    }}
                  >
                    <option value="">{t('unassigned_option')}</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
