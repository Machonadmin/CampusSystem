'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { PersonSelect } from '@/components/ui/person-select'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toastError, toastSuccess } from '@/components/ui/toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Teacher { person_id: string; name: string; source: 'kodesh' | 'manual' }
interface StudentOption { journey_id: string; name: string }
interface Assignment {
  id: string
  teacher_person_id: string
  teacher_name: string
  student_journey_id: string
  student_name: string
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ChavrutaHubClient({ canManage }: { canManage: boolean }) {
  const t = useTranslations('chavruta')
  const tNav = useTranslations('navigation')
  const accent = getModuleColor('education', 'primary')

  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [students, setStudents] = useState<StudentOption[]>([])
  const [loaded, setLoaded] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [featureOff, setFeatureOff] = useState(false)

  // Pool add
  const [addPerson, setAddPerson] = useState<string | null>(null)
  const [addingTeacher, setAddingTeacher] = useState(false)

  // Pairing form
  const [pairTeacher, setPairTeacher] = useState('')
  const [pairStudent, setPairStudent] = useState('')
  const [pairing, setPairing] = useState(false)

  const load = useCallback(async () => {
    try {
      const [tRes, aRes] = await Promise.all([
        fetch('/api/chavruta/teachers'),
        fetch('/api/chavruta/assignments'),
      ])
      if (tRes.status === 403 || aRes.status === 403) { setForbidden(true); return }
      if (tRes.status === 503 || aRes.status === 503) { setFeatureOff(true) }
      if (tRes.ok) setTeachers((await tRes.json())?.teachers ?? [])
      if (aRes.ok) {
        const b = await aRes.json()
        setAssignments(b?.assignments ?? [])
        setStudents(b?.students ?? [])
      }
    } catch {
      /* ignore */
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function addTeacher() {
    if (!addPerson || addingTeacher) return
    setAddingTeacher(true)
    try {
      const res = await fetch('/api/chavruta/teachers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: addPerson }),
      })
      if (!res.ok) { toastError(t('error')); return }
      setAddPerson(null)
      toastSuccess(t('teacher_added'))
      await load()
    } catch { toastError(t('error')) } finally { setAddingTeacher(false) }
  }

  async function removeTeacher(personId: string) {
    if (!(await confirmDialog({ message: t('confirm_remove_teacher'), tone: 'danger' }))) return
    try {
      const res = await fetch(`/api/chavruta/teachers/${personId}`, { method: 'DELETE' })
      if (!res.ok) { toastError(t('error')); return }
      toastSuccess(t('teacher_removed'))
      await load()
    } catch { toastError(t('error')) }
  }

  async function assignPair() {
    if (!pairTeacher || !pairStudent || pairing) return
    setPairing(true)
    try {
      const res = await fetch('/api/chavruta/assignments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_person_id: pairTeacher, student_journey_id: pairStudent }),
      })
      if (!res.ok) { toastError(t('error')); return }
      setPairStudent('')
      toastSuccess(t('pair_added'))
      await load()
    } catch { toastError(t('error')) } finally { setPairing(false) }
  }

  async function removePair(id: string) {
    if (!(await confirmDialog({ message: t('confirm_remove_pair'), tone: 'danger' }))) return
    try {
      const res = await fetch(`/api/chavruta/assignments/${id}`, { method: 'DELETE' })
      if (!res.ok) { toastError(t('error')); return }
      toastSuccess(t('pair_removed'))
      await load()
    } catch { toastError(t('error')) }
  }

  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }
  const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }
  const input: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border-strong)',
    borderRadius: 8, outline: 'none', color: 'var(--text)', boxSizing: 'border-box', background: 'var(--surface)',
  }
  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }
  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase',
    letterSpacing: 0.5, padding: '10px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = { fontSize: 13, color: 'var(--text)', padding: '10px 12px', borderBottom: '1px solid var(--surface-2)' }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('hub_title') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('education'),
        borderRadius: 14, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(16,185,129,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('hub_title')}</h1>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{t('hub_subtitle')}</div>
        </div>
        <a
          href="/dashboard/chavruta"
          style={{
            fontSize: 13, fontWeight: 600, color: 'var(--success)', background: 'var(--surface)',
            border: 'none', borderRadius: 8, padding: '8px 14px', textDecoration: 'none', whiteSpace: 'nowrap',
          }}
        >{t('open_teacher_journal')}</a>
      </div>

      {!loaded ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('loading')}</div>
      ) : forbidden ? (
        <div style={{ ...card, color: 'var(--text-muted)' }}>{t('forbidden_hub')}</div>
      ) : (
        <>
          {featureOff && (
            <div style={{ ...card, color: 'var(--text-muted)' }}>{t('feature_not_ready')}</div>
          )}

          {/* ── Pairing (шиюх) ── */}
          <div style={card}>
            <h2 style={sectionTitle}>{t('assign_title')}</h2>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{t('assign_hint')}</div>

            {canManage && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr)) auto', gap: 12, alignItems: 'flex-end', marginBottom: 14 }}>
                <div>
                  <span style={label}>{t('select_teacher')}</span>
                  <select value={pairTeacher} onChange={e => setPairTeacher(e.target.value)} style={input}>
                    <option value="">{t('select_teacher')}</option>
                    {teachers.map(tc => <option key={tc.person_id} value={tc.person_id}>{tc.name || '—'}</option>)}
                  </select>
                </div>
                <div>
                  <span style={label}>{t('col_student')}</span>
                  <select value={pairStudent} onChange={e => setPairStudent(e.target.value)} style={input}>
                    <option value="">{t('select_student')}</option>
                    {students.map(s => <option key={s.journey_id} value={s.journey_id}>{s.name || '—'}</option>)}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={assignPair}
                  disabled={!pairTeacher || !pairStudent || pairing}
                  style={{
                    padding: '9px 18px', fontSize: 13, fontWeight: 600,
                    background: (!pairTeacher || !pairStudent || pairing) ? 'var(--border)' : accent,
                    color: (!pairTeacher || !pairStudent || pairing) ? 'var(--text-faint)' : '#fff',
                    border: 'none', borderRadius: 8,
                    cursor: (!pairTeacher || !pairStudent || pairing) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                  }}
                >{pairing ? t('saving') : t('assign_pair')}</button>
              </div>
            )}

            {assignments.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('no_pairs')}</div>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>{t('col_teacher')}</th>
                      <th style={th}>{t('col_student')}</th>
                      {canManage && <th style={{ ...th, textAlign: 'end' }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map(a => (
                      <tr key={a.id}>
                        <td style={{ ...td, fontWeight: 500 }}>{a.teacher_name || '—'}</td>
                        <td style={td}>{a.student_name || '—'}</td>
                        {canManage && (
                          <td style={{ ...td, textAlign: 'end' }}>
                            <button
                              type="button"
                              onClick={() => removePair(a.id)}
                              style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger, #DC2626)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                            >× {t('remove_teacher')}</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Teacher pool (מאגר) ── */}
          <div style={card}>
            <h2 style={sectionTitle}>{t('pool_title')}</h2>

            {canManage && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <PersonSelect value={addPerson} onChange={pid => setAddPerson(pid)} label={t('add_teacher')} accentColor={accent} />
                </div>
                <button
                  type="button"
                  onClick={addTeacher}
                  disabled={!addPerson || addingTeacher}
                  style={{
                    padding: '9px 18px', fontSize: 13, fontWeight: 600,
                    background: (!addPerson || addingTeacher) ? 'var(--border)' : accent,
                    color: (!addPerson || addingTeacher) ? 'var(--text-faint)' : '#fff',
                    border: 'none', borderRadius: 8,
                    cursor: (!addPerson || addingTeacher) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                  }}
                >{addingTeacher ? t('saving') : t('add_teacher')}</button>
              </div>
            )}

            {teachers.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('no_teachers')}</div>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>{t('col_name')}</th>
                      <th style={th}>{t('col_source')}</th>
                      {canManage && <th style={{ ...th, textAlign: 'end' }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {teachers.map(tc => (
                      <tr key={tc.person_id}>
                        <td style={{ ...td, fontWeight: 500 }}>{tc.name || '—'}</td>
                        <td style={td}>
                          <span style={{
                            display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                            background: tc.source === 'kodesh' ? 'var(--surface-2)' : 'var(--accent-tint, #ECFDF5)',
                            color: tc.source === 'kodesh' ? 'var(--text-muted)' : accent, border: '1px solid var(--border)',
                          }}>
                            {tc.source === 'kodesh' ? t('source_kodesh') : t('source_manual')}
                          </span>
                        </td>
                        {canManage && (
                          <td style={{ ...td, textAlign: 'end' }}>
                            {tc.source === 'manual' && (
                              <button
                                type="button"
                                onClick={() => removeTeacher(tc.person_id)}
                                style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger, #DC2626)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                              >× {t('remove_teacher')}</button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
