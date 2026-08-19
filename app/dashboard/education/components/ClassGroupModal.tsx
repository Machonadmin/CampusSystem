'use client'

import { useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { PersonSelect } from '@/components/ui/person-select'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { localizedDeptName } from '@/lib/departments/localized-name'

interface Department { id: string; name: string; name_he?: string | null; name_en?: string | null }
interface Subject { id: string; name: string }

interface ClassGroupInitial {
  id: string
  name: string
  level: string | null
  period_start: string | null
  period_end: string | null
  notes: string | null
  is_active: boolean
  department_id: string
  subject_id: string
  teachers: { person_id: string; full_name: string | null; is_primary: boolean }[]
}

interface Props {
  mode: 'create' | 'edit'
  initial: ClassGroupInitial | null
  departments: Department[]
  onClose: () => void
  onSaved: () => void
}

const accent = getModuleColor('education')

export default function ClassGroupModal({ mode, initial, departments, onClose, onSaved }: Props) {
  const t = useTranslations('education.study')
  const { lang } = useLang()
  const [name, setName] = useState(initial?.name ?? '')
  const [departmentId, setDepartmentId] = useState(initial?.department_id ?? '')
  const [subjectId, setSubjectId] = useState(initial?.subject_id ?? '')
  const [level, setLevel] = useState(initial?.level ?? '')
  const [periodStart, setPeriodStart] = useState(initial?.period_start ?? '')
  const [periodEnd, setPeriodEnd] = useState(initial?.period_end ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)
  const [primaryTeacherId, setPrimaryTeacherId] = useState<string | null>(
    initial?.teachers.find(tc => tc.is_primary)?.person_id ?? null
  )

  const [subjects, setSubjects] = useState<Subject[]>([])
  const [subjectsLoading, setSubjectsLoading] = useState(false)
  const [levelOptions, setLevelOptions] = useState<string[]>([])

  // Уже используемые уровни — для выбора из существующих (не плодить варианты).
  useEffect(() => {
    fetch('/api/education/class-groups/levels')
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (b?.levels) setLevelOptions(b.levels) })
      .catch(() => {})
  }, [])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Каскадная загрузка предметов при смене подразделения
  useEffect(() => {
    if (!departmentId) {
      setSubjects([])
      setSubjectId('')
      return
    }
    setSubjectsLoading(true)
    fetch(`/api/education/subjects?department_id=${departmentId}&active_only=false`)
      .then(r => r.ok ? r.json() : { subjects: [] })
      .then(json => {
        const list: Subject[] = json.subjects ?? []
        setSubjects(list)
        setSubjectId(prev => list.some(s => s.id === prev) ? prev : '')
      })
      .catch(() => setSubjects([]))
      .finally(() => setSubjectsLoading(false))
  }, [departmentId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError(t('common.name_required')); return }
    if (!departmentId) { setError(t('common.department_required')); return }
    if (!subjectId) { setError(t('class_groups.subject_required')); return }

    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        department_id: departmentId,
        subject_id: subjectId,
        level: level.trim() || null,
        period_start: periodStart || null,
        period_end: periodEnd || null,
        notes: notes.trim() || null,
      }

      if (mode === 'create') {
        if (primaryTeacherId) payload.teacher_ids = [primaryTeacherId]
      } else {
        payload.is_active = isActive
      }

      const url = mode === 'create'
        ? '/api/education/class-groups'
        : `/api/education/class-groups/${initial!.id}`

      const resp = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}))
        setError(errJson.error ?? `${t('common.error_generic')} ${resp.status}`)
        setSaving(false)
        return
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error_send_generic'))
      setSaving(false)
    }
  }

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }
  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '1px solid var(--border-strong)', borderRadius: 8,
    boxSizing: 'border-box', outline: 'none',
  }
  const hint: React.CSSProperties = { padding: '7px 10px', fontSize: 13, color: 'var(--text-faint)', border: '1px solid var(--border)', borderRadius: 8 }

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
          width: '100%', maxWidth: 540,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            {mode === 'create' ? t('class_groups.modal_create_title') : t('class_groups.modal_edit_title')}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Название */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('common.name_label')} *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} style={inp} autoFocus placeholder={t('class_groups.name_placeholder')} />
          </div>

          {/* Подразделение */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('common.department_label')} *</label>
            <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} style={inp}>
              <option value="">{t('common.select_placeholder')}</option>
              {departments.map(d => <option key={d.id} value={d.id}>{localizedDeptName(d, lang)}</option>)}
            </select>
          </div>

          {/* Предмет */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('class_groups.subject_label')} *</label>
            {!departmentId ? (
              <div style={hint}>{t('class_groups.select_subject_first')}</div>
            ) : subjectsLoading ? (
              <div style={hint}>{t('common.loading')}</div>
            ) : subjects.length === 0 ? (
              <div style={hint}>{t('class_groups.no_subjects_for_dept')}</div>
            ) : (
              <select value={subjectId} onChange={e => setSubjectId(e.target.value)} style={inp}>
                <option value="">{t('class_groups.select_subject_placeholder')}</option>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>

          {/* Уровень */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('class_groups.level_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
            <input type="text" value={level} onChange={e => setLevel(e.target.value)} style={inp} placeholder={t('class_groups.level_placeholder')} list="cg-level-options" />
            <datalist id="cg-level-options">
              {levelOptions.map(lv => <option key={lv} value={lv} />)}
            </datalist>
          </div>

          {/* Период */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('class_groups.period_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} style={{ ...inp, flex: 1 }} />
              <span style={{ color: 'var(--text-faint)', fontSize: 13, flexShrink: 0 }}>—</span>
              <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} style={{ ...inp, flex: 1 }} />
            </div>
          </div>

          {/* Основной преподаватель — только в create */}
          {mode === 'create' && (
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>{t('class_groups.primary_teacher_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
              <PersonSelect
                value={primaryTeacherId}
                onChange={id => setPrimaryTeacherId(id)}
                placeholder={t('class_groups.primary_teacher_placeholder')}
                accentColor={accent}
              />
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                {t('class_groups.primary_teacher_hint')}
              </div>
            </div>
          )}

          {/* Активна — только в edit */}
          {mode === 'edit' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                {t('class_groups.active_checkbox')}
              </label>
            </div>
          )}

          {/* Заметки */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('common.notes_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder={t('common.notes_placeholder')} />
          </div>

          {error && (
            <div style={{ padding: 10, marginBottom: 12, background: '#FEE2E2', color: '#991B1B', borderRadius: 6, fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--surface-2)' }}>
            <button
              type="button" onClick={onClose} disabled={saving}
              style={{ padding: '8px 16px', fontSize: 13, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 8, cursor: 'pointer' }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit" disabled={saving}
              style={{ padding: '8px 18px', fontSize: 13, fontWeight: 500, color: '#fff', background: accent, border: 'none', borderRadius: 8, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? t('common.saving') : (mode === 'create' ? t('common.create') : t('common.save'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
