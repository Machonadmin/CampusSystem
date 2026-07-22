'use client'

import { useEffect, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import { PersonSelect } from '@/components/ui/person-select'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { localizedDeptName } from '@/lib/departments/localized-name'
import { yearLevelLabel } from '@/lib/education/year-level'

interface Department { id: string; name: string; name_he?: string | null; name_en?: string | null }
interface StudyTrack { id: string; name_he: string | null; name_ru: string | null; name_en: string | null }
interface StudentOption { id: string; person: { id: string; full_name: string } | null; main_group?: { id: string; name: string } | null }

interface TeacherRow { person_id: string | null; monthly_rate: string; is_primary: boolean }

interface SemesterGroupInitial {
  id: string
  name: string
  year_label: string | null
  term_number: number | null
  year_level?: number | null
  study_track_id: string | null
  department_id: string
  tuition_amount: number | null
  period_start: string | null
  period_end: string | null
  teachers: { person_id: string; full_name: string | null; is_primary: boolean; monthly_rate: number | null }[]
  students: { journey_id: string; full_name: string | null }[]
}

/** Предзаполнение при создании из контекста drill-down (структура/год/набор). */
interface SemesterDefaults {
  department_id?: string | null
  year_level?: number | null
  year_label?: string | null
}

interface Props {
  mode: 'create' | 'edit'
  initial: SemesterGroupInitial | null
  departments: Department[]
  defaults?: SemesterDefaults
  onClose: () => void
  onSaved: () => void
}

const accent = getModuleColor('education')

function trackLabel(tr: StudyTrack, lang: string): string {
  if (lang === 'ru') return (tr.name_ru && tr.name_ru.trim()) || tr.name_he || tr.name_en || ''
  if (lang === 'en') return (tr.name_en && tr.name_en.trim()) || tr.name_he || tr.name_ru || ''
  return (tr.name_he && tr.name_he.trim()) || tr.name_ru || tr.name_en || ''
}

export default function SemesterGroupModal({ mode, initial, departments, defaults, onClose, onSaved }: Props) {
  const t = useTranslations('education.study')
  const { lang } = useLang()

  const [name, setName] = useState(initial?.name ?? '')
  const [yearLabel, setYearLabel] = useState(initial?.year_label ?? defaults?.year_label ?? '')
  const [termNumber, setTermNumber] = useState(initial?.term_number != null ? String(initial.term_number) : '')
  const [yearLevel, setYearLevel] = useState(
    initial?.year_level != null ? String(initial.year_level)
      : defaults?.year_level != null ? String(defaults.year_level) : '',
  )
  const [trackId, setTrackId] = useState(initial?.study_track_id ?? '')
  const [departmentId, setDepartmentId] = useState(initial?.department_id ?? defaults?.department_id ?? '')
  const [tuition, setTuition] = useState(initial?.tuition_amount != null ? String(initial.tuition_amount) : '')
  const [periodStart, setPeriodStart] = useState(initial?.period_start ?? '')
  const [periodEnd, setPeriodEnd] = useState(initial?.period_end ?? '')

  const [teachers, setTeachers] = useState<TeacherRow[]>(
    initial?.teachers.length
      ? initial.teachers.map(tc => ({ person_id: tc.person_id, monthly_rate: tc.monthly_rate != null ? String(tc.monthly_rate) : '', is_primary: tc.is_primary }))
      : [{ person_id: null, monthly_rate: '', is_primary: true }],
  )

  const [tracks, setTracks] = useState<StudyTrack[]>([])
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([])
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(
    new Set((initial?.students ?? []).map(s => s.journey_id)),
  )
  const [studentSearch, setStudentSearch] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Справочник маршрутов (study_tracks). Деплой-безопасно: пустой при отсутствии.
  useEffect(() => {
    fetch('/api/education/study-tracks')
      .then(r => (r.ok ? r.json() : { tracks: [] }))
      .then(b => setTracks(b.tracks ?? []))
      .catch(() => setTracks([]))
  }, [])

  // Кандидатки-студентки (education_status='student').
  useEffect(() => {
    fetch('/api/education/students?status=student')
      .then(r => (r.ok ? r.json() : { students: [] }))
      .then(b => setStudentOptions(b.students ?? []))
      .catch(() => setStudentOptions([]))
  }, [])

  const addTeacherRow = () => setTeachers(prev => [...prev, { person_id: null, monthly_rate: '', is_primary: prev.length === 0 }])
  const removeTeacherRow = (idx: number) => setTeachers(prev => prev.filter((_, i) => i !== idx))
  const setTeacherPerson = (idx: number, id: string | null) =>
    setTeachers(prev => prev.map((r, i) => (i === idx ? { ...r, person_id: id } : r)))
  const setTeacherRate = (idx: number, val: string) =>
    setTeachers(prev => prev.map((r, i) => (i === idx ? { ...r, monthly_rate: val } : r)))
  const setPrimary = (idx: number) =>
    setTeachers(prev => prev.map((r, i) => ({ ...r, is_primary: i === idx })))

  const toggleStudent = (journeyId: string) =>
    setSelectedStudents(prev => {
      const next = new Set(prev)
      if (next.has(journeyId)) next.delete(journeyId)
      else next.add(journeyId)
      return next
    })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError(t('common.name_required')); return }
    if (!departmentId) { setError(t('common.department_required')); return }

    setSaving(true)
    setError(null)
    try {
      const teacherPayload = teachers
        .filter(tc => tc.person_id)
        .map(tc => ({
          person_id: tc.person_id as string,
          is_primary: tc.is_primary,
          monthly_rate: tc.monthly_rate.trim() ? Number(tc.monthly_rate) : null,
        }))

      const payload: Record<string, unknown> = {
        name: name.trim(),
        year_label: yearLabel.trim() || null,
        term_number: termNumber.trim() ? Number(termNumber) : null,
        year_level: yearLevel.trim() ? Number(yearLevel) : null,
        study_track_id: trackId || null,
        department_id: departmentId,
        tuition_amount: tuition.trim() ? Number(tuition) : null,
        period_start: periodStart || null,
        period_end: periodEnd || null,
        teachers: teacherPayload,
        student_journey_ids: Array.from(selectedStudents),
      }

      const url = mode === 'create'
        ? '/api/education/semester-groups'
        : `/api/education/semester-groups/${initial!.id}`

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
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error_send_generic'))
      setSaving(false)
    }
  }

  const filteredStudents = studentSearch.trim()
    ? studentOptions.filter(s => (s.person?.full_name ?? '').toLowerCase().includes(studentSearch.trim().toLowerCase()))
    : studentOptions

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text)', marginBottom: 4, display: 'block' }
  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '1px solid var(--border-strong)', borderRadius: 8,
    boxSizing: 'border-box', outline: 'none',
  }

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
          width: '100%', maxWidth: 560,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
            {mode === 'create' ? t('semester_groups.modal_create_title') : t('semester_groups.modal_edit_title')}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* 1. Название */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('common.name_label')} *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} style={inp} autoFocus placeholder={t('semester_groups.name_placeholder')} />
          </div>

          {/* 2. Год-ступень (א/ב/ג) + еврейский год (набор) + номер семестра */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 110 }}>
              <label style={lbl}>{t('semester_groups.year_level_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
              <select value={yearLevel} onChange={e => setYearLevel(e.target.value)} style={inp}>
                <option value="">—</option>
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{yearLevelLabel(n, lang)}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>{t('semester_groups.year_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
              <input type="text" value={yearLabel} onChange={e => setYearLabel(e.target.value)} style={inp} placeholder={t('semester_groups.year_placeholder')} />
            </div>
            <div style={{ width: 110 }}>
              <label style={lbl}>{t('semester_groups.term_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
              <input type="number" min={1} value={termNumber} onChange={e => setTermNumber(e.target.value)} style={inp} placeholder="1" />
            </div>
          </div>

          {/* 3. Маршрут (study_track) */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('semester_groups.track_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
            <select value={trackId} onChange={e => setTrackId(e.target.value)} style={inp}>
              <option value="">{t('semester_groups.track_placeholder')}</option>
              {tracks.map(tr => <option key={tr.id} value={tr.id}>{trackLabel(tr, lang)}</option>)}
            </select>
          </div>

          {/* 4. Подразделение (обязательно) */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('common.department_label')} *</label>
            <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} style={inp}>
              <option value="">{t('common.select_placeholder')}</option>
              {departments.map(d => <option key={d.id} value={d.id}>{localizedDeptName(d, lang)}</option>)}
            </select>
          </div>

          {/* 5. Преподаватели: PersonSelect + месячная оплата */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('semester_groups.teachers_label')}</label>
            {teachers.map((row, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <PersonSelect
                    value={row.person_id}
                    onChange={id => setTeacherPerson(idx, id)}
                    placeholder={t('semester_groups.teacher_placeholder')}
                    accentColor={accent}
                  />
                </div>
                <div style={{ width: 130, position: 'relative' }}>
                  <input
                    type="number" min={0} step="0.01"
                    value={row.monthly_rate}
                    onChange={e => setTeacherRate(idx, e.target.value)}
                    style={{ ...inp, paddingRight: 26 }}
                    placeholder={t('semester_groups.monthly_pay_placeholder')}
                  />
                  <span style={{ position: 'absolute', right: 9, top: 8, fontSize: 12, color: 'var(--text-faint)', pointerEvents: 'none' }}>₪</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', paddingTop: 8, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <input type="radio" name="sg-primary" checked={row.is_primary} onChange={() => setPrimary(idx)} />
                  {t('semester_groups.primary_short')}
                </label>
                <button type="button" onClick={() => removeTeacherRow(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 18, lineHeight: 1, paddingTop: 6 }}>×</button>
              </div>
            ))}
            <button type="button" onClick={addTeacherRow} style={{ marginTop: 2, padding: '5px 10px', fontSize: 12, color: accent, background: 'var(--surface)', border: `1px solid ${accent}`, borderRadius: 6, cursor: 'pointer' }}>
              {t('semester_groups.add_teacher_button')}
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{t('semester_groups.monthly_pay_hint')}</div>
          </div>

          {/* 6. Студентки — мультивыбор */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('semester_groups.students_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>({selectedStudents.size})</span></label>
            <input
              type="text" value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
              style={{ ...inp, marginBottom: 6 }} placeholder={t('semester_groups.students_search_placeholder')}
            />
            <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              {filteredStudents.length === 0 ? (
                <div style={{ padding: 14, textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>{t('semester_groups.no_students_found')}</div>
              ) : filteredStudents.map((s, i) => {
                const checked = selectedStudents.has(s.id)
                return (
                  <label key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px',
                    borderTop: i > 0 ? '1px solid var(--surface-2)' : 'none', cursor: 'pointer',
                    background: checked ? `${accent}10` : 'transparent',
                  }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleStudent(s.id)} style={{ accentColor: accent }} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{s.person?.full_name ?? '—'}</span>
                    {s.main_group && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.main_group.name}</span>}
                  </label>
                )
              })}
            </div>
          </div>

          {/* 7. Школьная плата за семестр */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('semester_groups.tuition_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
            <div style={{ position: 'relative' }}>
              <input type="number" min={0} step="0.01" value={tuition} onChange={e => setTuition(e.target.value)} style={{ ...inp, paddingRight: 26 }} placeholder="0.00" />
              <span style={{ position: 'absolute', right: 10, top: 8, fontSize: 13, color: 'var(--text-faint)', pointerEvents: 'none' }}>₪</span>
            </div>
          </div>

          {/* 8. Период */}
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>{t('semester_groups.period_label')} <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>{t('common.optional_suffix')}</span></label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} style={{ ...inp, flex: 1 }} />
              <span style={{ color: 'var(--text-faint)', fontSize: 13, flexShrink: 0 }}>—</span>
              <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} style={{ ...inp, flex: 1 }} />
            </div>
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
