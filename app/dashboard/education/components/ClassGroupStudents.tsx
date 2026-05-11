'use client'

import { useEffect, useRef, useState } from 'react'

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

const STATUS_LABEL: Record<string, string> = {
  on_leave:  'Академотпуск',
  graduated: 'Выпускник',
  expelled:  'Отчислен',
}
const STATUS_STYLE: Record<string, React.CSSProperties> = {
  on_leave:  { background: '#FFFBEB', color: '#92400E' },
  graduated: { background: '#EFF6FF', color: '#1E40AF' },
  expelled:  { background: '#F3F4F6', color: '#6B7280' },
}

export default function ClassGroupStudents({ groupId, students, onChange, accentColor }: Props) {
  const [enrolling, setEnrolling] = useState(false)

  const handleRemove = async (studentId: string) => {
    if (!confirm('Снять студента с этой учебной группы?')) return
    try {
      const resp = await fetch(`/api/education/class-groups/${groupId}/enrollments/${studentId}`, {
        method: 'DELETE',
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        alert(err.error ?? 'Ошибка снятия')
        return
      }
      onChange()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка')
    }
  }

  const btnSmall: React.CSSProperties = {
    padding: '4px 10px', fontSize: 12, color: '#374151',
    background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer',
  }

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1F2937', margin: 0 }}>
          Студенты
          <span style={{ fontWeight: 400, color: '#6B7280', marginLeft: 6, fontSize: 13 }}>
            ({students.length} {plural(students.length, 'человек', 'человека', 'человек')})
          </span>
        </h2>
        <button
          onClick={() => setEnrolling(true)}
          style={{ padding: '4px 10px', fontSize: 12, color: accentColor, borderColor: accentColor, background: '#fff', border: `1px solid ${accentColor}`, borderRadius: 6, cursor: 'pointer' }}
        >
          + Записать студентов
        </button>
      </div>

      {/* Список */}
      {students.length === 0 ? (
        <div style={{ color: '#9CA3AF', fontSize: 13, padding: '8px 0' }}>Студенты не записаны</div>
      ) : (
        <div>
          {students.map((s, i) => (
            <div
              key={s.id}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderTop: i > 0 ? '1px solid #F3F4F6' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#1F2937' }}>
                    {s.person?.full_name ?? '—'}
                  </span>
                  {s.main_group && (
                    <span style={{ fontSize: 12, color: '#6B7280', marginLeft: 8 }}>
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
                Снять
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

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
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
        alert(err.error ?? 'Ошибка записи')
        return
      }
      const data = await resp.json().catch(() => ({}))
      const added = data.added ?? selected.size
      const skipped = data.skipped ?? 0
      const msg = skipped > 0
        ? `Записано ${added} студентов (${skipped} уже были в группе)`
        : `Записано ${added} студентов`
      alert(msg)
      onDone()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка')
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
          background: '#fff', borderRadius: 12, padding: 24,
          width: '100%', maxWidth: 520,
          maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1F2937', margin: 0 }}>
            Записать студентов
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по имени…"
          autoFocus
          style={{
            width: '100%', padding: '8px 12px', fontSize: 13,
            border: '1px solid #D1D5DB', borderRadius: 8,
            boxSizing: 'border-box', outline: 'none', marginBottom: 10,
          }}
        />

        <div style={{ flex: 1, overflowY: 'auto', borderRadius: 8, border: '1px solid #E5E7EB' }}>
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Загрузка…</div>
          )}
          {!loading && candidates.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Ничего не найдено</div>
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
                  borderTop: i > 0 ? '1px solid #F3F4F6' : 'none',
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
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1F2937' }}>
                    {s.person?.full_name ?? '—'}
                  </div>
                  {s.main_group && (
                    <div style={{ fontSize: 11, color: '#6B7280' }}>{s.main_group.name}</div>
                  )}
                </div>
                {alreadyIn && (
                  <span style={{ fontSize: 11, color: '#6B7280' }}>в группе</span>
                )}
              </label>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, paddingTop: 12, borderTop: '1px solid #F3F4F6' }}>
          <button
            onClick={onClose} disabled={saving}
            style={{ padding: '8px 16px', fontSize: 13, color: '#374151', background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8, cursor: 'pointer' }}
          >
            Отмена
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
            {saving ? 'Запись…' : `Записать выбранных (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}
