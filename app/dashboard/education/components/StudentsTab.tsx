'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getModuleColor } from '@/lib/module-colors'
import PageActionButton from '@/components/ui/PageActionButton'
import EducationJourneyForm from '@/components/education/EducationJourneyForm'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { localizedDeptName } from '@/lib/departments/localized-name'
import { toast } from '@/components/ui/toast'

interface Department { id: string; name: string; name_he?: string | null; name_en?: string | null }
interface StudyGroup { id: string; name: string; department_id: string }

/** Статусы учебного цикла (education_status в education_journeys). */
type StudentStatus = 'student' | 'on_leave' | 'graduated' | 'expelled'

interface Student {
  id: string
  person_id: string
  education_status: StudentStatus
  primary_department_id: string
  specialty_id: string | null
  main_group_id: string | null
  year_level: number | null
  year_start: number | null
  enrolled_at: string | null
  notes: string | null
  person: {
    id: string
    full_name: string
    hebrew_name: string | null
    email: string | null
    phones: { type: string; number: string }[] | null
    gender: string | null
    birth_date: string | null
  } | null
  main_group: { id: string; name: string; year_level: number | null } | null
  specialty: { id: string; name: string; code: string | null } | null
  primary_department: { id: string; name: string } | null
}

// Цвет = только статус (правило цвета, спринт 0.3): токены success/warn/info/muted.
const STATUS_STYLE: Record<StudentStatus, React.CSSProperties> = {
  student:   { background: 'var(--success-tint)', color: 'var(--success)' },
  on_leave:  { background: 'var(--warn-tint)', color: 'var(--warn)' },
  graduated: { background: 'var(--info-tint)', color: 'var(--info)' },
  expelled:  { background: 'var(--surface-2)', color: 'var(--text-muted)' },
}

const accent = getModuleColor('education')

export default function StudentsTab() {
  const t = useTranslations('education.study')
  const { lang } = useLang()
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [studyGroups, setStudyGroups] = useState<StudyGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [filterStatus, setFilterStatus] = useState('')  // '' = active+on_leave

  const [modalOpen, setModalOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)  // прогрессивное раскрытие: детали строки по клику
  // Фильтры (подразделение/группа/статус) свёрнуты за одной кнопкой «Фильтры»,
  // чтобы тулбар не пестрил — на виду только поиск и «+ студент».
  const [filtersOpen, setFiltersOpen] = useState(false)

  // ── Массовое назначение (bulk): класс / маршрут / кодеш ──
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkType, setBulkType] = useState<'class' | 'track' | 'kodesh'>('class')
  const [bulkTarget, setBulkTarget] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)
  const [classGroups, setClassGroups] = useState<{ id: string; name: string }[]>([])
  const [tracks, setTracks] = useState<{ id: string; name: string }[]>([])
  const [kodeshGroups, setKodeshGroups] = useState<{ id: string; name: string }[]>([])

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const STATUS_LABEL: Record<StudentStatus, string> = {
    student:   t('students.status_student'),
    on_leave:  t('students.status_on_leave'),
    graduated: t('students.status_graduated'),
    expelled:  t('students.status_expelled'),
  }

  const loadStudents = useCallback(async (q: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q) params.set('search', q)
      if (filterDept) params.set('department_id', filterDept)
      if (filterGroup) params.set('main_group_id', filterGroup)
      // Фильтр статуса → набор education_status учебного цикла.
      const statusSet =
        filterStatus === 'active' ? 'student'
        : filterStatus === 'all'  ? 'student,on_leave,graduated,expelled'
        : 'student,on_leave'  // по умолчанию: учатся + в отпуске
      params.set('status', statusSet)

      const resp = await fetch(`/api/education/students?${params}`)
      if (!resp.ok) throw new Error(t('students.load_error').replace('{status}', String(resp.status)))
      const json = await resp.json()
      setStudents(json.students ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error_unknown'))
    } finally {
      setLoading(false)
    }
  }, [filterDept, filterGroup, filterStatus, t])

  // Загрузка справочников один раз
  useEffect(() => {
    Promise.all([
      fetch('/api/settings/departments').then(r => r.ok ? r.json() : []),
      fetch('/api/education/study-groups?active_only=false').then(r => r.ok ? r.json() : { study_groups: [] }),
    ]).then(([dJson, gJson]) => {
      setDepartments(Array.isArray(dJson) ? dJson : (dJson.departments ?? []))
      setStudyGroups((gJson.study_groups ?? []).map((g: { id: string; name: string; department_id: string }) => ({
        id: g.id, name: g.name, department_id: g.department_id,
      })))
    }).catch(() => {})
  }, [])

  // Debounced перезагрузка при поиске
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadStudents(search), search ? 300 : 0)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search, loadStudents])

  // Сбрасываем фильтр группы при смене подразделения
  useEffect(() => { setFilterGroup('') }, [filterDept])

  // Справочники целей массового назначения (класс/маршрут/кодеш). Kodesh может
  // вернуть 403 если пользователь не глава кодеша — тогда просто нет целей.
  useEffect(() => {
    fetch('/api/education/class-groups')
      .then(r => r.ok ? r.json() : { class_groups: [] })
      .then(j => setClassGroups(((j.class_groups ?? []) as Array<{ id: string; name: string }>).map(g => ({ id: g.id, name: g.name }))))
      .catch(() => {})
    fetch('/api/education/study-tracks')
      .then(r => r.ok ? r.json() : { tracks: [] })
      .then(j => setTracks(((j.tracks ?? []) as Array<{ id: string; name_he: string | null; name_ru: string | null; name_en: string | null; code: string }>)
        .map(tk => ({ id: tk.id, name: tk.name_he || tk.name_ru || tk.name_en || tk.code }))))
      .catch(() => {})
    fetch('/api/education/kodesh/assignment')
      .then(r => r.ok ? r.json() : { groups: [] })
      .then(j => setKodeshGroups(((j.groups ?? []) as Array<{ id: string; name: string }>).map(g => ({ id: g.id, name: g.name }))))
      .catch(() => {})
  }, [])

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }
  function toggleSelectAll() {
    setSelected(prev => prev.size === students.length ? new Set() : new Set(students.map(s => s.id)))
  }
  function exitSelect() { setSelectMode(false); setSelected(new Set()) }

  const bulkTargets = bulkType === 'class' ? classGroups : bulkType === 'track' ? tracks : kodeshGroups

  async function applyBulk() {
    if (!bulkTarget || selected.size === 0) return
    setBulkBusy(true); setBulkMsg(null)
    const ids = [...selected]
    let ok = 0, fail = 0
    if (bulkType === 'class') {
      const res = await fetch(`/api/education/class-groups/${bulkTarget}/enrollments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journey_ids: ids }),
      })
      if (res.ok) ok = ids.length; else fail = ids.length
    } else {
      for (const jid of ids) {
        const url = bulkType === 'track' ? `/api/education/journeys/${jid}/track` : '/api/education/kodesh/assignment'
        const body = bulkType === 'track' ? { track_id: bulkTarget } : { journey_id: jid, group_id: bulkTarget }
        const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (res.ok) ok++; else fail++
      }
    }
    setBulkBusy(false)
    setBulkMsg(t('students.bulk.result').replace('{ok}', String(ok)).replace('{fail}', String(fail)))
    exitSelect()
    loadStudents(search)
  }

  const handleExpel = async (student: Student) => {
    const name = student.person?.full_name ?? t('students.expel_fallback_name')
    if (!confirm(t('students.expel_confirm').replace('{name}', name))) return
    try {
      const resp = await fetch(`/api/education/students/${student.id}`, { method: 'DELETE' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        toast(err.error ?? t('students.expel_failed'), 'error')
        return
      }
      loadStudents(search)
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error_generic'), 'error')
    }
  }

  const handleSaved = () => {
    setModalOpen(false)
    loadStudents(search)
  }

  const filteredGroups = filterDept
    ? studyGroups.filter(g => g.department_id === filterDept)
    : studyGroups

  // Сколько фильтров активно — показываем счётчиком на кнопке «Фильтры».
  const activeFilters = (filterDept ? 1 : 0) + (filterGroup ? 1 : 0) + (filterStatus ? 1 : 0)

  const inp: React.CSSProperties = { padding: '7px 10px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none' }
  const btnSecondary: React.CSSProperties = {
    padding: '5px 10px', fontSize: 12, color: 'var(--text)',
    background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: 6, cursor: 'pointer',
  }

  return (
    <div>
      {/* Тулбар — спокойный: поиск + «Фильтры» (за кнопкой) + «+ студент». */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: filtersOpen ? 10 : 16, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('students.search_placeholder')}
          style={{ ...inp, minWidth: 220, flex: '1 1 240px' }}
        />
        <button
          type="button"
          onClick={() => setFiltersOpen(v => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', fontSize: 13,
            cursor: 'pointer', borderRadius: 8, fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
            border: `1px solid ${filtersOpen || activeFilters > 0 ? 'var(--accent-strong)' : 'var(--border-strong)'}`,
            background: filtersOpen || activeFilters > 0 ? 'var(--accent-tint)' : 'var(--surface)',
            color: filtersOpen || activeFilters > 0 ? 'var(--accent-strong)' : 'var(--text-muted)',
          }}
        >
          <svg style={{ width: 15, height: 15 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
          </svg>
          {t('students.filters_label')}
          {activeFilters > 0 && (
            <span style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 99, background: 'var(--accent-strong)', color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{activeFilters}</span>
          )}
          <span style={{ fontSize: 9, opacity: 0.75 }}>{filtersOpen ? '▲' : '▼'}</span>
        </button>
        <button
          type="button"
          onClick={() => { if (selectMode) exitSelect(); else { setSelectMode(true); setBulkMsg(null) } }}
          style={{
            padding: '7px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 8, fontWeight: 600,
            fontFamily: 'inherit', whiteSpace: 'nowrap',
            border: `1px solid ${selectMode ? 'var(--accent-strong)' : 'var(--border-strong)'}`,
            background: selectMode ? 'var(--accent-tint)' : 'var(--surface)',
            color: selectMode ? 'var(--accent-strong)' : 'var(--text-muted)',
          }}
        >
          {selectMode ? t('students.bulk.exit') : t('students.bulk.select')}
        </button>
        <div style={{ marginInlineStart: 'auto' }}>
          <PageActionButton
            label={t('students.add_button')}
            onClick={() => setModalOpen(true)}
            accentColor={accent}
          />
        </div>
      </div>

      {/* Свёрнутые фильтры — открываются по кнопке «Фильтры». */}
      {filtersOpen && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={inp}>
            <option value="">{t('students.all_departments')}</option>
            {departments.map(d => <option key={d.id} value={d.id}>{localizedDeptName(d, lang)}</option>)}
          </select>
          <select
            value={filterGroup}
            onChange={e => setFilterGroup(e.target.value)}
            disabled={filteredGroups.length === 0}
            style={{ ...inp, opacity: filteredGroups.length === 0 ? 0.5 : 1 }}
          >
            <option value="">{t('students.all_groups')}</option>
            {filteredGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={inp}>
            <option value="">{t('students.filter_active_on_leave')}</option>
            <option value="active">{t('students.filter_active_only')}</option>
            <option value="all">{t('students.filter_all')}</option>
          </select>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => { setFilterDept(''); setFilterGroup(''); setFilterStatus('') }}
              style={{ padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', background: 'none', border: 'none', color: 'var(--accent-strong)', fontWeight: 600, fontFamily: 'inherit' }}
            >
              {t('students.filters_clear')}
            </button>
          )}
        </div>
      )}

      {/* Панель массового назначения */}
      {selectMode && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--accent-strong)', borderRadius: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{t('students.bulk.selected').replace('{n}', String(selected.size))}</span>
          <select value={bulkType} onChange={e => { setBulkType(e.target.value as 'class' | 'track' | 'kodesh'); setBulkTarget('') }} style={inp}>
            <option value="class">{t('students.bulk.type_class')}</option>
            <option value="track">{t('students.bulk.type_track')}</option>
            <option value="kodesh">{t('students.bulk.type_kodesh')}</option>
          </select>
          <select value={bulkTarget} onChange={e => setBulkTarget(e.target.value)} style={{ ...inp, minWidth: 160 }}>
            <option value="">{t('students.bulk.pick_target')}</option>
            {bulkTargets.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <button
            onClick={applyBulk}
            disabled={bulkBusy || !bulkTarget || selected.size === 0}
            style={{ ...inp, cursor: bulkBusy || !bulkTarget || selected.size === 0 ? 'default' : 'pointer', fontWeight: 600, background: accent, color: '#fff', borderColor: accent, opacity: bulkBusy || !bulkTarget || selected.size === 0 ? 0.5 : 1 }}
          >
            {t('students.bulk.apply')}
          </button>
        </div>
      )}

      {bulkMsg && (
        <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8, marginBottom: 12, fontSize: 13, color: 'var(--text)' }}>{bulkMsg}</div>
      )}

      {loading && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>{t('common.loading')}</div>}

      {error && (
        <div style={{ padding: 12, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        students.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>
            {search || filterDept || filterGroup || filterStatus ? t('students.empty_search') : t('students.empty_none')}
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {selectMode && (
                    <th style={{ ...thStyle, width: 36, textAlign: 'center' }}>
                      <input type="checkbox" checked={students.length > 0 && selected.size === students.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                    </th>
                  )}
                  <th style={thStyle}>{t('students.table_name')}</th>
                  <th style={thStyle}>{t('students.table_department')}</th>
                  <th style={thStyle}>{t('students.table_group')}</th>
                  <th style={{ ...thStyle, width: 110 }}>{t('students.table_status')}</th>
                  <th style={{ ...thStyle, width: 170 }}>{t('students.table_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => {
                  const phone = s.person?.phones?.[0]?.number ?? null
                  const expelled = s.education_status === 'expelled'
                  const cardHref = `/dashboard/education/students/${s.id}`
                  const open = expandedId === s.id
                  const colCount = selectMode ? 6 : 5
                  return (
                    <Fragment key={s.id}>
                      <tr
                        onClick={() => setExpandedId(open ? null : s.id)}
                        style={{ borderTop: '1px solid var(--surface-2)', cursor: 'pointer', background: open ? 'var(--surface-2)' : undefined }}
                        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                      >
                        {selectMode && (
                          <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} style={{ cursor: 'pointer' }} />
                          </td>
                        )}
                        <td style={{ ...tdStyle, fontWeight: 500 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ fontSize: 9, color: 'var(--text-faint)', transition: 'transform .15s', transform: `rotate(${open ? 90 : (lang === 'he' ? 180 : 0)}deg)` }}>▶</span>
                            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{s.person?.full_name ?? '—'}</span>
                          </span>
                          {s.person?.hebrew_name && (
                            <div style={{ fontSize: 11, color: 'var(--text-faint)', direction: 'rtl', textAlign: 'start', marginTop: 2, marginInlineStart: 16 }}>{s.person.hebrew_name}</div>
                          )}
                        </td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{s.primary_department?.name ?? '—'}</td>
                        <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{s.main_group?.name ?? <span style={{ color: 'var(--border-strong)' }}>—</span>}</td>
                        <td style={tdStyle}>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500, whiteSpace: 'nowrap',
                            ...(STATUS_STYLE[s.education_status] ?? { background: 'var(--surface-2)', color: 'var(--text-muted)' }),
                          }}>
                            {STATUS_LABEL[s.education_status] ?? s.education_status}
                          </span>
                        </td>
                        <td style={tdStyle} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => router.push(cardHref)} style={btnSecondary}>
                              {t('students.open_card')}
                            </button>
                            {!expelled && (
                              <button
                                onClick={() => handleExpel(s)}
                                style={{ ...btnSecondary, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                              >
                                {t('students.expel_button')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr style={{ background: 'var(--surface-2)' }}>
                          <td colSpan={colCount} style={{ padding: '2px 16px 14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px 22px', paddingInlineStart: 16 }}>
                              <Detail label={t('students.table_contacts')} value={[s.person?.email, phone].filter(Boolean).join('  ·  ') || '—'} />
                              <Detail label={t('students.table_specialty')} value={s.specialty ? (s.specialty.code ? `[${s.specialty.code}] ${s.specialty.name}` : s.specialty.name) : '—'} />
                              <Detail label={t('students.table_year')} value={s.year_level != null ? String(s.year_level) : '—'} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {modalOpen && (
        <EducationJourneyForm
          mode="student"
          onClose={() => setModalOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px', fontWeight: 600, color: 'var(--text)',
  textAlign: 'start', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = { padding: '10px 12px', color: 'var(--text)' }

// Пара «метка → значение» в раскрытой панели деталей строки.
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}
