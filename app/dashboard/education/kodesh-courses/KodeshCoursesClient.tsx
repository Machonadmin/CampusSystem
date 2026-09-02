'use client'

import { useCallback, useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { PersonSelect } from '@/components/ui/person-select'
import { toast } from '@/components/ui/toast'
import { SkeletonRows } from '@/components/ui/Skeleton'

const KODESH_DEPT_ID = '9a3d7b3f-3f65-4653-a111-4d5296404a27'
const accent = getModuleColor('education')

interface TeacherEntry { person_id: string; full_name: string | null; is_primary: boolean }
interface Group {
  id: string
  name: string
  name_he: string | null
  name_en: string | null
  parent_semester_id: string | null
  subject_id: string | null
  hours: number | null
  teachers: TeacherEntry[]
}
interface Approval { id: string; course_group_id: string; teacher_id: string; status: string; teacher: { hebrew_name: string | null; full_name: string | null } | null }

export default function KodeshCoursesClient() {
  const t = useTranslations('education.kodesh_courses')
  const { lang } = useLang()
  const [groups, setGroups] = useState<Group[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [createFor, setCreateFor] = useState<string | null>(null) // level id
  const [newName, setNewName] = useState('')
  const [newHours, setNewHours] = useState('')

  const [editHoursFor, setEditHoursFor] = useState<string | null>(null)
  const [hoursVal, setHoursVal] = useState('')

  const [proposeFor, setProposeFor] = useState<string | null>(null) // course id
  const [proposeTeacher, setProposeTeacher] = useState<string | null>(null)

  const gname = (g: Group) => (lang === 'he' ? (g.name_he || g.name) : lang === 'en' ? (g.name_en || g.name) : g.name)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [gRes, aRes] = await Promise.all([
        fetch(`/api/education/class-groups?department_id=${KODESH_DEPT_ID}`),
        fetch('/api/education/teacher-approvals'),
      ])
      if (gRes.ok) { const b = await gRes.json(); setGroups(b.class_groups ?? []) }
      if (aRes.ok) { const b = await aRes.json(); setApprovals(b.approvals ?? []) }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const levels = groups.filter(g => !g.parent_semester_id)
  const coursesByLevel = new Map<string, Group[]>()
  for (const g of groups) {
    if (g.parent_semester_id) {
      const arr = coursesByLevel.get(g.parent_semester_id) ?? []
      arr.push(g); coursesByLevel.set(g.parent_semester_id, arr)
    }
  }
  const approvalsByCourse = new Map<string, Approval[]>()
  for (const a of approvals) {
    const arr = approvalsByCourse.get(a.course_group_id) ?? []
    arr.push(a); approvalsByCourse.set(a.course_group_id, arr)
  }

  const createCourse = async (levelId: string) => {
    if (!newName.trim()) { toast(t('name_required'), 'error'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/education/semester-groups/${levelId}/courses`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), hours: newHours ? Number(newHours) : null }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string }
        toast(res.status === 403 ? t('create_forbidden') : (b.error ?? t('action_failed')), 'error')
        return
      }
      setCreateFor(null); setNewName(''); setNewHours('')
      load()
    } finally { setBusy(false) }
  }

  const saveHours = async (course: Group) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/education/class-groups/${course.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: hoursVal ? Number(hoursVal) : null }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(b.error ?? t('action_failed'), 'error'); return }
      setEditHoursFor(null)
      load()
    } finally { setBusy(false) }
  }

  const propose = async (courseId: string) => {
    if (!proposeTeacher) return
    setBusy(true)
    try {
      const res = await fetch('/api/education/teacher-approvals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_group_id: courseId, teacher_id: proposeTeacher }),
      })
      if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; toast(b.error ?? t('action_failed'), 'error'); return }
      setProposeFor(null); setProposeTeacher(null)
      toast(t('proposed_ok'), 'success')
      load()
    } finally { setBusy(false) }
  }

  const statusLabel = (s: string) => t(`status_${s}`)
  const inp: React.CSSProperties = { padding: '6px 9px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }
  const linkBtn: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }

  if (loading) return <SkeletonRows rows={6} />

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>{t('create_hint')}</p>
      {levels.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)' }}>{t('no_levels')}</div>}
      {levels.map(level => {
        const courses = coursesByLevel.get(level.id) ?? []
        return (
          <div key={level.id} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{gname(level)}</span>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>· {t('courses_count').replace('{n}', String(courses.length))}</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => { setCreateFor(createFor === level.id ? null : level.id); setNewName(''); setNewHours('') }} style={linkBtn}>+ {t('add_course')}</button>
            </div>

            {createFor === level.id && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t('course_name')} dir="rtl" autoFocus style={{ ...inp, flex: 1, minWidth: 160 }} />
                <input value={newHours} onChange={e => setNewHours(e.target.value)} placeholder={t('hours')} type="number" min={0} style={{ ...inp, width: 90 }} />
                <button disabled={busy} onClick={() => createCourse(level.id)} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: accent, border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer' }}>{t('create')}</button>
              </div>
            )}

            {courses.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-faint)' }}>{t('no_courses')}</div>
            ) : courses.map((c, i) => {
              const cApprovals = approvalsByCourse.get(c.id) ?? []
              const noTeacher = c.teachers.length === 0
              const noHours = c.hours === null || c.hours <= 0
              return (
                <div key={c.id} style={{ padding: '11px 14px', borderTop: i > 0 ? '1px solid var(--surface-2)' : 'none', display: 'grid', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{c.name}</span>
                    {/* Часы */}
                    {editHoursFor === c.id ? (
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <input value={hoursVal} onChange={e => setHoursVal(e.target.value)} type="number" min={0} style={{ ...inp, width: 72 }} />
                        <button disabled={busy} onClick={() => saveHours(c)} style={linkBtn}>{t('save')}</button>
                        <button onClick={() => setEditHoursFor(null)} style={{ ...linkBtn, color: 'var(--text-faint)' }}>✕</button>
                      </span>
                    ) : (
                      <button onClick={() => { setEditHoursFor(c.id); setHoursVal(c.hours != null ? String(c.hours) : '') }} style={{ ...linkBtn, color: 'var(--text-muted)', fontWeight: 500 }}>
                        {t('hours')}: {c.hours ?? '—'} ✎
                      </button>
                    )}
                    {noTeacher && <span style={badge('var(--warn)')}>{t('badge_no_teacher')}</span>}
                    {noHours && <span style={badge('var(--warn)')}>{t('badge_no_hours')}</span>}
                    <div style={{ flex: 1 }} />
                    <button onClick={() => { setProposeFor(proposeFor === c.id ? null : c.id); setProposeTeacher(null) }} style={linkBtn}>{t('propose_teacher')}</button>
                  </div>

                  {/* Преподаватели + статусы предложений */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
                    {c.teachers.map(tc => (
                      <span key={tc.person_id} style={{ color: 'var(--text-muted)', background: 'var(--surface-2)', borderRadius: 999, padding: '2px 9px' }}>{tc.full_name || '—'}{tc.is_primary ? ' ★' : ''}</span>
                    ))}
                    {cApprovals.filter(a => a.status !== 'approved').map(a => (
                      <span key={a.id} style={{ color: a.status === 'rejected' ? 'var(--danger)' : 'var(--text-faint)', background: 'var(--surface-2)', borderRadius: 999, padding: '2px 9px' }}>
                        {(a.teacher?.hebrew_name || a.teacher?.full_name || '')} · {statusLabel(a.status)}
                      </span>
                    ))}
                  </div>

                  {proposeFor === c.id && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                      <div style={{ minWidth: 220 }}>
                        <PersonSelect value={proposeTeacher} onChange={id => setProposeTeacher(id)} roleFilter="teacher" source="/api/education/teachers" allowAdd={false} placeholder={t('choose_teacher')} accentColor={accent} />
                      </div>
                      <button disabled={busy || !proposeTeacher} onClick={() => propose(c.id)} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: proposeTeacher ? accent : 'var(--text-faint)', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: proposeTeacher ? 'pointer' : 'default' }}>{t('propose')}</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function badge(color: string): React.CSSProperties {
  return { fontSize: 11, fontWeight: 700, color, background: 'var(--warn-tint)', border: `1px solid ${color}`, borderRadius: 999, padding: '1px 8px' }
}
