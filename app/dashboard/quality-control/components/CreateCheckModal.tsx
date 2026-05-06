'use client'

import { useEffect, useRef, useState } from 'react'

interface PersonOption { id: string; full_name: string }
interface TemplateOption { id: string; name: string }

interface Props {
  onClose: () => void
  onCreated: () => void
}

function PersonAutocomplete({
  label, value, onChange,
}: {
  label: string
  value: { id: string; name: string } | null
  onChange: (v: { id: string; name: string } | null) => void
}) {
  const [query, setQuery] = useState(value?.name ?? '')
  const [options, setOptions] = useState<PersonOption[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value) setQuery(value.name)
  }, [value])

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  function handleInput(v: string) {
    setQuery(v)
    onChange(null)
    if (timer.current) clearTimeout(timer.current)
    if (v.length < 2) { setOptions([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/quality-control/persons?q=${encodeURIComponent(v)}`)
      if (res.ok) {
        const data: PersonOption[] = await res.json()
        setOptions(data)
        setOpen(data.length > 0)
      }
    }, 250)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
        {label} <span style={{ color: '#EF4444' }}>*</span>
      </label>
      <input
        value={query}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => { if (options.length > 0 && !value) setOpen(true) }}
        placeholder="Начните вводить имя..."
        style={{
          width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #D1D5DB',
          borderRadius: 6, outline: 'none', backgroundColor: value ? '#F0FDF4' : '#fff',
          borderColor: value ? '#86EFAC' : '#D1D5DB',
          boxSizing: 'border-box',
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => { onChange(null); setQuery(''); setOptions([]); setOpen(false) }}
          style={{ position: 'absolute', right: 8, top: 28, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 16, lineHeight: 1 }}
        >×</button>
      )}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: 2,
        }}>
          {options.map(p => (
            <div
              key={p.id}
              onClick={() => { onChange({ id: p.id, name: p.full_name }); setQuery(p.full_name); setOpen(false) }}
              style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: '#374151' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#F9FAFB' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '' }}
            >
              {p.full_name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CreateCheckModal({ onClose, onCreated }: Props) {
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [templateId, setTemplateId] = useState('')
  const [lessonDate, setLessonDate] = useState(new Date().toISOString().split('T')[0])
  const [lessonTime, setLessonTime] = useState('09:00')
  const [observer, setObserver] = useState<{ id: string; name: string } | null>(null)
  const [teacher, setTeacher] = useState<{ id: string; name: string } | null>(null)
  const [groupName, setGroupName] = useState('')
  const [courseName, setCourseName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/settings/quality-templates')
      .then(r => r.ok ? r.json() : [])
      .then((data: TemplateOption[]) => {
        setTemplates(data)
        if (data.length > 0) setTemplateId(data[0].id)
      })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!observer) { setError('Укажите наблюдателя'); return }
    if (!teacher) { setError('Укажите преподавателя'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/quality-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId || null,
          lesson_date: lessonDate,
          lesson_time: lessonTime,
          observer_person_id: observer.id,
          teacher_person_id: teacher.id,
          group_name: groupName || null,
          course_name: courseName || null,
          status: 'planned',
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Ошибка'); return }
      onCreated()
    } catch {
      setError('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #F3F4F6' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>Новая проверка урока</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Template */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Шаблон проверки</label>
              <select
                value={templateId}
                onChange={e => setTemplateId(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none', backgroundColor: '#fff' }}
              >
                <option value="">— без шаблона —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Date + Time */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Дата урока <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="date"
                  value={lessonDate}
                  onChange={e => setLessonDate(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  Время <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="time"
                  value={lessonTime}
                  onChange={e => setLessonTime(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Observer */}
            <PersonAutocomplete label="Наблюдатель" value={observer} onChange={setObserver} />

            {/* Teacher */}
            <PersonAutocomplete label="Преподаватель" value={teacher} onChange={setTeacher} />

            {/* Group + Course */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Группа</label>
                <input
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder="Название группы"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Курс / Предмет</label>
                <input
                  value={courseName}
                  onChange={e => setCourseName(e.target.value)}
                  placeholder="Название курса"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 6, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 14, padding: '8px 12px', backgroundColor: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: 6, fontSize: 12, color: '#DC2626' }}>
              {error}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid #F3F4F6' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#374151' }}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '8px 20px', fontSize: 13, border: 'none', borderRadius: 6,
                background: saving ? '#93C5FD' : '#3B82F6', cursor: saving ? 'not-allowed' : 'pointer',
                color: '#fff', fontWeight: 600,
              }}
            >
              {saving ? 'Сохранение...' : 'Создать проверку'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
