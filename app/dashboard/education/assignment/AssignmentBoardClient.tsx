'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import { toast } from '@/components/ui/toast'
import { SkeletonRows } from '@/components/ui/Skeleton'

interface Group {
  id: string; name: string; subject: string | null; unit: string | null
  is_semester: boolean; parent_name: string | null
  teachers: { person_id: string; name: string }[]
  students: { journey_id: string; name: string }[]
}
interface StudentPool { journey_id: string; name: string }
interface TeacherPool { person_id: string; name: string }
type Mode = 'students' | 'teachers'
type DragPayload = { kind: Mode; id: string; name: string }

export default function AssignmentBoardClient() {
  const t = useTranslations('education.assignment_board')
  const tNav = useTranslations('navigation')

  const [groups, setGroups] = useState<Group[]>([])
  const [students, setStudents] = useState<StudentPool[]>([])
  const [teachers, setTeachers] = useState<TeacherPool[]>([])
  const [mode, setMode] = useState<Mode>('students')
  const [search, setSearch] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overGroup, setOverGroup] = useState<string | null>(null)
  const [busyGroup, setBusyGroup] = useState<string | null>(null)
  // Клик-режим (touch/планшет + быстрее мыши): выбрать человека → кликнуть группу.
  const [selected, setSelected] = useState<DragPayload | null>(null)

  const load = useCallback(async () => {
    const d = await fetch('/api/education/assignment-board').then(r => r.ok ? r.json() : null).catch(() => null)
    if (d) { setGroups(d.groups ?? []); setStudents(d.students ?? []); setTeachers(d.teachers ?? []) }
    setLoaded(true)
  }, [])
  useEffect(() => { load() }, [load])

  const pool = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base: DragPayload[] = mode === 'students'
      ? students.map(s => ({ kind: 'students' as const, id: s.journey_id, name: s.name }))
      : teachers.map(tc => ({ kind: 'teachers' as const, id: tc.person_id, name: tc.name }))
    return q ? base.filter(p => p.name.toLowerCase().includes(q)) : base
  }, [mode, students, teachers, search])

  function alreadyIn(group: Group, payload: DragPayload): boolean {
    return payload.kind === 'students'
      ? group.students.some(s => s.journey_id === payload.id)
      : group.teachers.some(tc => tc.person_id === payload.id)
  }

  async function assign(groupId: string, payload: DragPayload) {
    const group = groups.find(g => g.id === groupId)
    if (!group || alreadyIn(group, payload)) return
    setBusyGroup(groupId)
    try {
      const res = payload.kind === 'students'
        ? await fetch(`/api/education/class-groups/${groupId}/enrollments`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ journey_ids: [payload.id] }),
          })
        : await fetch(`/api/education/class-groups/${groupId}/teachers`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacher_ids: [payload.id], make_first_primary: true }),
          })
      if (!res.ok) { const b = await res.json().catch(() => ({})); toast(b.error || t('assign_failed'), 'error'); return }
      setGroups(gs => gs.map(g => g.id !== groupId ? g : payload.kind === 'students'
        ? { ...g, students: [...g.students, { journey_id: payload.id, name: payload.name }] }
        : { ...g, teachers: [...g.teachers, { person_id: payload.id, name: payload.name }] }))
      setSelected(null)
    } finally { setBusyGroup(null) }
  }

  async function remove(groupId: string, kind: Mode, id: string) {
    setBusyGroup(groupId)
    try {
      const res = kind === 'students'
        ? await fetch(`/api/education/class-groups/${groupId}/enrollments/${id}`, { method: 'DELETE' })
        : await fetch(`/api/education/class-groups/${groupId}/teachers/${id}`, { method: 'DELETE' })
      if (!res.ok) { const b = await res.json().catch(() => ({})); toast(b.error || t('remove_failed'), 'error'); return }
      setGroups(gs => gs.map(g => g.id !== groupId ? g : kind === 'students'
        ? { ...g, students: g.students.filter(s => s.journey_id !== id) }
        : { ...g, teachers: g.teachers.filter(tc => tc.person_id !== id) }))
    } finally { setBusyGroup(null) }
  }

  const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '3px 8px', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }
  const xBtn: React.CSSProperties = { cursor: 'pointer', color: 'var(--text-faint)', fontSize: 13, lineHeight: 1, border: 'none', background: 'none', padding: 0 }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education'), href: '/dashboard/education' },
        { label: t('title') },
      ]} />

      <div style={{ background: getModuleHeaderGradient('education'), borderRadius: 12, padding: '16px 24px', color: '#fff', boxShadow: '0 2px 8px rgba(16,185,129,0.15)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{t('title')}</h1>
        <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>{t('subtitle')}</div>
      </div>

      {!loaded ? (
        <SkeletonRows />
      ) : (
        <div className="split-cols" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          {/* Пул для перетаскивания */}
          <div style={{ position: 'sticky', top: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: 4, padding: 2, background: 'var(--surface-2)', borderRadius: 8, marginBottom: 10 }}>
              {(['students', 'teachers'] as Mode[]).map(m => (
                <button key={m} onClick={() => { setMode(m); setSearch('') }}
                  style={{ flex: 1, padding: '6px 0', fontSize: 12.5, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', background: mode === m ? 'var(--accent)' : 'transparent', color: mode === m ? '#fff' : 'var(--text-muted)' }}>
                  {t(m === 'students' ? 'tab_students' : 'tab_teachers')}
                </button>
              ))}
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search')}
              style={{ padding: '8px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, marginBottom: 10 }} />
            <div style={{ fontSize: 11, color: selected ? 'var(--accent-strong)' : 'var(--text-faint)', fontWeight: selected ? 600 : 400, marginBottom: 8 }}>
              {selected ? t('click_target_hint').replace('{name}', selected.name) : t('drag_hint')}
            </div>
            <div style={{ overflowY: 'auto', display: 'grid', gap: 6 }}>
              {pool.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{t('pool_empty')}</div>
              ) : pool.map(p => {
                const sel = selected?.kind === p.kind && selected?.id === p.id
                return (
                <div key={p.id} draggable
                  onDragStart={e => { e.dataTransfer.setData('text/plain', JSON.stringify(p)); e.dataTransfer.effectAllowed = 'copy'; setDragId(p.id) }}
                  onDragEnd={() => setDragId(null)}
                  onClick={() => setSelected(s => (s?.kind === p.kind && s?.id === p.id) ? null : p)}
                  style={{ padding: '8px 10px', fontSize: 13, borderRadius: 8, background: sel ? 'var(--accent)' : dragId === p.id ? 'var(--accent-tint)' : 'var(--surface-2)', color: sel ? '#fff' : 'var(--text)', border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer', opacity: dragId === p.id ? 0.6 : 1, userSelect: 'none' }}>
                  {p.name}
                </div>
                )
              })}
            </div>
          </div>

          {/* Группы — зоны сброса */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {groups.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('no_groups')}</div>
            ) : groups.map(g => {
              const over = overGroup === g.id
              const selectable = !!selected && !alreadyIn(g, selected)
              const highlight = over || selectable
              return (
                <div key={g.id}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!over) setOverGroup(g.id) }}
                  onDragLeave={() => setOverGroup(o => o === g.id ? null : o)}
                  onDrop={e => {
                    e.preventDefault(); setOverGroup(null)
                    try { const p = JSON.parse(e.dataTransfer.getData('text/plain')) as DragPayload; if (p?.id) assign(g.id, p) } catch { /* ignore */ }
                  }}
                  onClick={() => { if (selected && !alreadyIn(g, selected)) assign(g.id, selected) }}
                  style={{ background: 'var(--surface)', border: `1.5px solid ${highlight ? 'var(--accent)' : 'var(--border)'}`, boxShadow: over ? '0 0 0 3px var(--accent-tint)' : 'none', borderRadius: 10, padding: 12, opacity: busyGroup === g.id ? 0.7 : 1, cursor: selectable ? 'pointer' : 'default', transition: 'box-shadow .1s, border-color .1s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: 0.3, padding: '1px 7px', borderRadius: 999, flexShrink: 0,
                      background: g.is_semester ? 'var(--accent-tint)' : 'var(--violet-tint)',
                      color: g.is_semester ? 'var(--accent-strong)' : 'var(--violet)',
                    }}>
                      {g.is_semester ? t('badge_semester') : t('badge_course')}
                    </span>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{g.name}</div>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginBottom: 8 }}>
                    {[g.parent_name ? `${t('badge_course')} · ${g.parent_name}` : null, g.subject, g.unit].filter(Boolean).join(' · ') || '—'}
                  </div>

                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{t('teachers_label')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8, minHeight: 22 }}>
                    {g.teachers.length === 0 ? <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>—</span> : g.teachers.map(tc => (
                      <span key={tc.person_id} style={{ ...chip, background: 'var(--accent-tint)', color: 'var(--accent-strong)', borderColor: 'var(--accent)' }}>
                        {tc.name}
                        <button onClick={e => { e.stopPropagation(); remove(g.id, 'teachers', tc.person_id) }} style={xBtn} title={t('remove')}>×</button>
                      </span>
                    ))}
                  </div>

                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
                    {t('students_label')} · {g.students.length}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minHeight: 22 }}>
                    {g.students.length === 0 ? <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>—</span> : g.students.map(s => (
                      <span key={s.journey_id} style={chip}>
                        {s.name}
                        <button onClick={e => { e.stopPropagation(); remove(g.id, 'students', s.journey_id) }} style={xBtn} title={t('remove')}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
