'use client'

import { useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { PersonSelect } from '@/components/ui/person-select'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface Subject { id: string; name: string; name_he?: string | null }
interface RosterStudent { journey_id: string; full_name: string | null }

interface Props {
  semesterId: string
  roster: RosterStudent[]
  onClose: () => void
  onSaved: () => void
}

const accent = getModuleColor('education')

export default function CourseModal({ semesterId, roster, onClose, onSaved }: Props) {
  const t = useTranslations('education.study')

  const [name, setName] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [teacherIds, setTeacherIds] = useState<(string | null)[]>([null])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/education/subjects')
      .then(r => (r.ok ? r.json() : { subjects: [] }))
      .then(b => setSubjects(Array.isArray(b) ? b : (b.subjects ?? [])))
      .catch(() => setSubjects([]))
  }, [])

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n
  })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError(t('courses.name_label')); return }
    setSaving(true); setError(null)
    try {
      const resp = await fetch(`/api/education/semester-groups/${semesterId}/courses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          subject_id: subjectId || null,
          teacher_ids: teacherIds.filter((x): x is string => Boolean(x)),
          student_journey_ids: Array.from(selected),
        }),
      })
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}))
        setError(j.error ?? `${t('common.error_generic')} ${resp.status}`)
        setSaving(false); return
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error_send_generic'))
      setSaving(false)
    }
  }

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }
  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, boxSizing: 'border-box', outline: 'none' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{t('courses.modal_title')}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <form onSubmit={submit}>
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('courses.name_label')} *</label>
            <input value={name} onChange={e => setName(e.target.value)} style={inp} autoFocus placeholder={t('courses.name_placeholder')} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('courses.subject_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
            <select value={subjectId} onChange={e => setSubjectId(e.target.value)} style={inp}>
              <option value="">{t('courses.subject_none')}</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name_he || s.name}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('courses.teachers_label')}</label>
            {teacherIds.map((tid, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <PersonSelect value={tid} onChange={id => setTeacherIds(prev => prev.map((v, i) => i === idx ? id : v))} placeholder={t('semester_groups.teacher_placeholder')} accentColor={accent} />
                </div>
                {teacherIds.length > 1 && (
                  <button type="button" onClick={() => setTeacherIds(prev => prev.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 18, lineHeight: 1 }}>×</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setTeacherIds(prev => [...prev, null])} style={{ marginTop: 2, padding: '5px 10px', fontSize: 12, color: accent, background: 'var(--surface)', border: `1px solid ${accent}`, borderRadius: 6, cursor: 'pointer' }}>
              {t('semester_groups.add_teacher_button')}
            </button>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('courses.students_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>({selected.size})</span></label>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 6 }}>{t('courses.students_hint')}</div>
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              {roster.length === 0 ? (
                <div style={{ padding: 14, textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>{t('courses.no_roster')}</div>
              ) : roster.map((s, i) => {
                const checked = selected.has(s.journey_id)
                return (
                  <label key={s.journey_id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderTop: i > 0 ? '1px solid var(--surface-2)' : 'none', cursor: 'pointer', background: checked ? 'var(--accent-tint)' : 'transparent' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(s.journey_id)} style={{ accentColor: accent }} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{s.full_name ?? '—'}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {error && <div style={{ padding: 10, marginBottom: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 6, fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
            <button type="button" onClick={onClose} disabled={saving} style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}>{t('common.cancel')}</button>
            <button type="submit" disabled={saving} style={{ padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff', background: accent, border: 'none', borderRadius: 8, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? t('common.saving') : t('common.create')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
