'use client'

import { useCallback, useEffect, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { PersonSelect } from '@/components/ui/person-select'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toastError, toastSuccess } from '@/components/ui/toast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Teacher {
  person_id: string
  name: string
  source: 'kodesh' | 'manual'
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ChavrutaTeachersClient() {
  const t = useTranslations('chavruta')
  const tNav = useTranslations('navigation')
  const accent = getModuleColor('finance', 'primary')

  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loaded, setLoaded] = useState(false)
  const [featureOff, setFeatureOff] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [addPerson, setAddPerson] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/chavruta/teachers')
      if (res.status === 403) { setForbidden(true); setTeachers([]); return }
      if (res.status === 503) { setFeatureOff(true); setTeachers([]); return }
      if (!res.ok) { setTeachers([]); return }
      const b = await res.json()
      setTeachers(b?.teachers ?? [])
    } catch {
      setTeachers([])
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function addTeacher() {
    if (!addPerson || adding) return
    setAdding(true)
    try {
      const res = await fetch('/api/chavruta/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: addPerson }),
      })
      if (!res.ok) { toastError(t('error')); return }
      setAddPerson(null)
      toastSuccess(t('teacher_added'))
      await load()
    } catch {
      toastError(t('error'))
    } finally {
      setAdding(false)
    }
  }

  async function removeTeacher(personId: string) {
    if (!window.confirm(t('confirm_remove_teacher'))) return
    try {
      const res = await fetch(`/api/chavruta/teachers/${personId}`, { method: 'DELETE' })
      if (!res.ok) { toastError(t('error')); return }
      toastSuccess(t('teacher_removed'))
      await load()
    } catch {
      toastError(t('error'))
    }
  }

  const th: React.CSSProperties = {
    textAlign: 'start', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)',
    textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
  const td: React.CSSProperties = { fontSize: 13, color: 'var(--text)', padding: '10px 12px', borderBottom: '1px solid var(--surface-2)' }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('finance'), href: '/dashboard/finance' },
        { label: t('teachers_title') },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('finance'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(5,150,105,0.15)',
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('teachers_title')}</h1>
        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{t('teachers_subtitle')}</div>
      </div>

      {!loaded ? (
        <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('loading')}</div>
      ) : forbidden ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>{t('not_a_teacher')}</div>
      ) : featureOff ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, fontSize: 13, color: 'var(--text-muted)' }}>{t('feature_not_ready')}</div>
      ) : (
        <>
          {/* Add teacher */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <PersonSelect
                value={addPerson}
                onChange={pid => setAddPerson(pid)}
                label={t('add_teacher')}
                accentColor={accent}
              />
            </div>
            <button
              type="button"
              onClick={addTeacher}
              disabled={!addPerson || adding}
              style={{
                padding: '9px 18px', fontSize: 13, fontWeight: 600,
                background: (!addPerson || adding) ? 'var(--border)' : accent,
                color: (!addPerson || adding) ? 'var(--text-faint)' : '#fff',
                border: 'none', borderRadius: 8,
                cursor: (!addPerson || adding) ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >{adding ? t('saving') : t('add_teacher')}</button>
          </div>

          {/* Teachers table */}
          {teachers.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('no_teachers')}</div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>{t('col_name')}</th>
                    <th style={th}>{t('col_source')}</th>
                    <th style={{ ...th, textAlign: 'end' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map(tc => (
                    <tr key={tc.person_id}>
                      <td style={{ ...td, fontWeight: 500 }}>{tc.name || '—'}</td>
                      <td style={td}>
                        <span style={{
                          display: 'inline-block', fontSize: 11, fontWeight: 600,
                          padding: '2px 8px', borderRadius: 999,
                          background: tc.source === 'kodesh' ? 'var(--surface-2)' : 'var(--accent-tint, #ECFDF5)',
                          color: tc.source === 'kodesh' ? 'var(--text-muted)' : accent,
                          border: '1px solid var(--border)',
                        }}>
                          {tc.source === 'kodesh' ? t('source_kodesh') : t('source_manual')}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'end' }}>
                        {tc.source === 'manual' && (
                          <button
                            type="button"
                            onClick={() => removeTeacher(tc.person_id)}
                            title={t('remove_teacher')}
                            style={{
                              fontSize: 12, fontWeight: 600, color: 'var(--danger, #DC2626)',
                              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px',
                            }}
                          >× {t('remove_teacher')}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
