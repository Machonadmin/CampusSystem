'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface StudentMini {
  id: string
  status: string
  person: {
    id: string
    full_name: string
    hebrew_name: string | null
    email: string | null
  } | null
  main_group: { id: string; name: string } | null
}

interface Props {
  groupId: string
  groupDepartmentId: string | null
  students: StudentMini[]
  onChange: () => void
  accentColor: string
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  on_leave:  { background: '#FFFBEB', color: '#92400E' },
  graduated: { background: 'var(--accent-tint)', color: '#1E40AF' },
  expelled:  { background: 'var(--surface-2)', color: 'var(--text-muted)' },
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

export default function ClassGroupStudents({ groupId, students, onChange, accentColor }: Props) {
  const t = useTranslations('education.study')
  const [enrolling, setEnrolling] = useState(false)

  const STATUS_LABEL: Record<string, string> = {
    on_leave:  t('students.status_on_leave'),
    graduated: t('students.status_graduated'),
    expelled:  t('students.status_expelled'),
  }

  const handleRemove = async (studentId: string) => {
    if (!confirm(t('class_groups.remove_student_confirm'))) return
    try {
      const resp = await fetch(`/api/education/class-groups/${groupId}/enrollments/${studentId}`, {
        method: 'DELETE',
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(err.error ?? t('class_groups.remove_student_failed'))
        return
      }
      onChange()
    } catch (e) {
      alert(e instanceof Error ? e.message : t('common.error_generic'))
    }
  }

  const btnSmall: React.CSSProperties = {
    padding: '4px 10px', fontSize: 12, color: 'var(--text)',
    background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          {t('class_groups.students_section_title')}
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 13 }}>
            ({students.length} {plural(students.length, t('class_groups.people_one'), t('class_groups.people_few'), t('class_groups.people_many'))})
          </span>
        </h2>
        <button
          onClick={() => setEnrolling(true)}
          style={{ padding: '4px 10px', fontSize: 12, color: accentColor, borderColor: accentColor, background: 'var(--surface)', border: `1px solid ${accentColor}`, borderRadius: 6, cursor: 'pointer' }}
        >
          {t('class_groups.enroll_students_button')}
        </button>
      </div>

      {/* Список */}
      {students.length === 0 ? (
        <div style={{ color: 'var(--text-faint)', fontSize: 13, padding: '8px 0' }}>{t('class_groups.no_students')}</div>
      ) : (
        <div>
          {students.map((s, i) => (
            <div
              key={s.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderTop: i > 0 ? '1px solid var(--surface-2)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div>
                  <Link
                    href={`/dashboard/education/students/${s.id}`}
                    style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', textDecoration: 'none' }}
                    onMouseEnter={e => { const el = e.currentTarget; el.style.color = accentColor; el.style.textDecoration = 'underline' }}
                    onMouseLeave={e => { const el = e.currentTarget; el.style.color = 'var(--text)'; el.style.textDecoration = 'none' }}
                  >
                    {s.person?.full_name ?? '—'}
                  </Link>
                  {s.main_group && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                      {s.main_group.name}
                    </span>
                  )}
                </div>
                {s.status !== 'active' && STATUS_LABEL[s.status] && (
                  <span style={{
                    fontSize: 11, padding: '2px 7px', borderRadius: 99, fontWeight: 500,
                    ...(STATUS_STYLE[s.status] ?? {}),
                  }}>
                    {STATUS_LABEL[s.status]}
                  </span>
                )}
              </div>
              <button
                onClick={() => handleRemove(s.id)}
                style={{ ...btnSmall, color: '#DC2626', borderColor: '#FCA5A5' }}
              >
                {t('class_groups.remove_button')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Модал записи */}
      {enrolling && (
        <EnrollModal
          groupId={groupId}
          enrolledIds={students.map(s => s.id)}
          accentColor={accentColor}
          onClose={() => setEnrolling(false)}
          onDone={() => { setEnrolling(false); onChange() }}
        />
      )}
    </div>
  )
}

// ── Модал записи студентов ────────────────────────────────────────────────────

interface CandidateStudent {
  id: string
  person: { id: string; full_name: string; email: string | null } | null
  main_group: { id: string; name: string } | null
  status: string
}

interface EnrollModalProps {
  groupId: string
  enrolledIds: string[]
  accentColor: string
  onClose: () => void
  onDone: () => void
}

function EnrollModal({ groupId, enrolledIds, accentColor, onClose, onDone }: EnrollModalProps) {
  const t = useTranslations('education.study')
  const [search, setSearch] = useState('')
  const [candidates, setCandidates] = useState<CandidateStudent[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchCandidates = (q: string) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('search', q)
    fetch(`/api/education/students?${params}`)
      .then(r => r.ok ? r.json() : { students: [] })
      .then(json => setCandidates(json.students ?? []))
      .catch(() => setCandidates([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => fetchCandidates(search), search ? 300 : 0)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleEnroll = async () => {
    if (selected.size === 0) return
    setSaving(true)
    try {
      const resp = await fetch(`/api/education/class-groups/${groupId}/enrollments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_ids: Array.from(selected) }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(err.error ?? t('class_groups.enroll_failed'))
        return
      }
      const data = await resp.json().catch(() => ({}))
      const added = data.added ?? selected.size
      const skipped = data.skipped ?? 0
      const msg = skipped > 0
        ? t('class_groups.enrolled_with_skipped').replace('{added}', String(added)).replace('{skipped}', String(skipped))
        : t('class_groups.enrolled_message').replace('{added}', String(added))
      alert(msg)
      onDone()
    } catch (e) {
      alert(e instanceof Error ? e.message : t('common.error_generic'))
    } finally {
      setSaving(false)
    }
  }

  const enrolledSet = new Set(enrolledIds)

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: 12, padding: 24,
          width: '100%', maxWidth: 520,
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            {t('class_groups.enroll_modal_title')}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('class_groups.search_by_name_placeholder')}
          autoFocus
          style={{
            width: '100%', padding: '8px 12px', fontSize: 13,
            border: '1px solid var(--border-strong)', borderRadius: 8,
            boxSizing: 'border-box', outline: 'none', marginBottom: 10,
          }}
        />

        <div style={{ flex: 1, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('common.loading')}</div>
          )}
          {!loading && candidates.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('common.nothing_found')}</div>
          )}
          {!loading && candidates.map((s, i) => {
            const alreadyIn = enrolledSet.has(s.id)
            const isChecked = selected.has(s.id)
            return (
              <label
                key={s.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px',
                  borderTop: i > 0 ? '1px solid var(--surface-2)' : 'none',
                  cursor: alreadyIn ? 'default' : 'pointer',
                  opacity: alreadyIn ? 0.45 : 1,
                  background: isChecked ? `${accentColor}08` : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={alreadyIn || isChecked}
                  disabled={alreadyIn}
                  onChange={() => !alreadyIn && toggle(s.id)}
                  style={{ accentColor }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                    {s.person?.full_name ?? '—'}
                  </div>
                  {s.main_group && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.main_group.name}</div>
                  )}
                </div>
                {alreadyIn && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('class_groups.already_in_group')}</span>
                )}
              </label>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
          <button
            onClick={onClose} disabled={saving}
            style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleEnroll} disabled={selected.size === 0 || saving}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff',
              background: accentColor, border: 'none', borderRadius: 8,
              cursor: (selected.size === 0 || saving) ? 'not-allowed' : 'pointer',
              opacity: (selected.size === 0 || saving) ? 0.55 : 1,
            }}
          >
            {saving ? t('class_groups.enrolling_button') : t('class_groups.enroll_button').replace('{count}', String(selected.size))}
          </button>
        </div>
      </div>
    </div>
  )
}
