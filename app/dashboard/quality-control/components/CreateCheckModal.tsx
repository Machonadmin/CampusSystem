'use client'

import { useEffect, useRef, useState } from 'react'
import { DateInput } from '@/components/ui/date-input'
import { useTranslations } from '@/lib/i18n/LanguageContext'

interface PersonOption { id: string; full_name: string }
interface TemplateOption { id: string; name: string }

interface ClassGroupOption {
  id: string
  name: string
  subject: { id: string; name: string } | null
  teachers: { person_id: string; full_name: string | null; is_primary: boolean }[]
}

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
  const t = useTranslations('quality')
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
        placeholder={t('create_modal.observer_placeholder')}
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
  const t = useTranslations('quality')
  const tCommon = useTranslations('common')
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [templateId, setTemplateId] = useState('')
  const [lessonDate, setLessonDate] = useState<Date | null>(new Date())
  const [lessonTime, setLessonTime] = useState('09:00')
  const [observer, setObserver] = useState<{ id: string; name: string } | null>(null)
  const [teacher, setTeacher] = useState<{ id: string; name: string } | null>(null)
  const [groupName, setGroupName] = useState('')
  const [courseName, setCourseName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Class group state
  const [classGroups, setClassGroups] = useState<ClassGroupOption[]>([])
  const [classGroupsLoading, setClassGroupsLoading] = useState(false)
  const [classGroupId, setClassGroupId] = useState<string>('')
  const [freeInput, setFreeInput] = useState(false)

  useEffect(() => {
    fetch('/api/settings/quality-templates')
      .then(r => r.ok ? r.json() : [])
      .then((data: TemplateOption[]) => {
        setTemplates(data)
        if (data.length > 0) setTemplateId(data[0].id)
      })
  }, [])

  useEffect(() => {
    setClassGroupsLoading(true)
    fetch('/api/education/class-groups?active_only=true')
      .then(r => r.ok ? r.json() : { class_groups: [] })
      .then(json => setClassGroups(json.class_groups ?? []))
      .catch(() => setClassGroups([]))
      .finally(() => setClassGroupsLoading(false))
  }, [])

  // When a class group is selected from dropdown — autofill fields
  function handleClassGroupChange(id: string) {
    setClassGroupId(id)
    if (!id) {
      setGroupName('')
      setCourseName('')
      return
    }
    const g = classGroups.find(c => c.id === id)
    if (!g) return
    setGroupName(g.name)
    setCourseName(g.subject?.name ?? '')
    // Autofill teacher: prefer primary, fallback to first
    const primary = g.teachers.find(t => t.is_primary)
    const firstTeacher = primary ?? g.teachers[0] ?? null
    if (firstTeacher?.full_name) {
      setTeacher({ id: firstTeacher.person_id, name: firstTeacher.full_name })
    }
  }

  // Toggle free input — clear class group selection
  function toggleFreeInput() {
    const next = !freeInput
    setFreeInput(next)
    if (next) {
      setClassGroupId('')
    } else {
      setGroupName('')
      setCourseName('')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!observer) { setError(t('create_modal.error_observer_required')); return }
    if (!teacher) { setError(t('create_modal.error_teacher_required')); return }

    setSaving(true)
    try {
      const res = await fetch('/api/quality-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: templateId || null,
          class_group_id: classGroupId || null,
          lesson_date: lessonDate ? lessonDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          lesson_time: lessonTime,
          observer_person_id: observer.id,
          teacher_person_id: teacher.id,
          group_name: groupName || null,
          course_name: courseName || null,
          status: 'planned',
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? tCommon('error')); return }
      onCreated()
    } catch {
      setError(t('create_modal.error_network'))
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #D1D5DB',
    borderRadius: 6, outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4,
  }

  const groupSelected = !freeInput && !!classGroupId

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ backgroundColor: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #F3F4F6' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0 }}>{t('create_modal.title')}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Template */}
            <div>
              <label style={labelStyle}>{t('create_modal.template_label')}</label>
              <select
                value={templateId}
                onChange={e => setTemplateId(e.target.value)}
                style={{ ...inputStyle, backgroundColor: '#fff' }}
              >
                <option value="">{t('create_modal.no_template_option')}</option>
                {templates.map(tpl => (
                  <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                ))}
              </select>
            </div>

            {/* Date + Time */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>
                  {t('create_modal.lesson_date_label')} <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <DateInput value={lessonDate} onChange={setLessonDate} placeholder={t('create_modal.lesson_date_placeholder')} />
              </div>
              <div>
                <label style={labelStyle}>
                  {t('create_modal.time_label')} <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <input
                  type="time"
                  value={lessonTime}
                  onChange={e => setLessonTime(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Observer */}
            <PersonAutocomplete label={t('create_modal.observer_label')} value={observer} onChange={setObserver} />

            {/* Group — dropdown or free input */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>{t('create_modal.group_label')}</label>
                <button
                  type="button"
                  onClick={toggleFreeInput}
                  style={{
                    fontSize: 11, color: '#6B7280', background: 'none', border: 'none',
                    cursor: 'pointer', textDecoration: 'underline', padding: 0,
                  }}
                >
                  {freeInput ? t('create_modal.select_list_toggle') : t('create_modal.free_input_toggle')}
                </button>
              </div>

              {freeInput ? (
                <input
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder={t('create_modal.group_name_placeholder')}
                  style={inputStyle}
                />
              ) : (
                <select
                  value={classGroupId}
                  onChange={e => handleClassGroupChange(e.target.value)}
                  disabled={classGroupsLoading}
                  style={{ ...inputStyle, backgroundColor: '#fff', opacity: classGroupsLoading ? 0.6 : 1 }}
                >
                  <option value="">{classGroupsLoading ? t('create_modal.loading_groups') : t('create_modal.select_group_placeholder')}</option>
                  {classGroups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name}{g.subject?.name ? ` — ${g.subject.name}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Course / Subject */}
            <div>
              <label style={labelStyle}>{t('create_modal.course_subject_label')}</label>
              <input
                value={courseName}
                onChange={e => setCourseName(e.target.value)}
                placeholder={t('create_modal.course_name_placeholder')}
                readOnly={groupSelected}
                style={{
                  ...inputStyle,
                  backgroundColor: groupSelected ? '#F9FAFB' : '#fff',
                  color: groupSelected ? '#6B7280' : '#111827',
                }}
              />
              {groupSelected && (
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>
                  {t('create_modal.autofilled_hint')}
                </div>
              )}
            </div>

            {/* Teacher */}
            <PersonAutocomplete label={t('create_modal.teacher_label')} value={teacher} onChange={setTeacher} />
            {groupSelected && classGroups.find(g => g.id === classGroupId)?.teachers.length ? (
              <div style={{ marginTop: -10, fontSize: 11, color: '#9CA3AF' }}>
                {t('create_modal.teacher_autofilled_hint')}
              </div>
            ) : null}

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
              {tCommon('cancel')}
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
              {saving ? t('fill.saving', 'Saving...') : t('create_modal.submit_button')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
