'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getModuleColor } from '@/lib/module-colors'
import PageActionButton from '@/components/ui/PageActionButton'
import SemesterGroupModal from './SemesterGroupModal'
import SemesterCourses from './SemesterCourses'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { localizedDeptName } from '@/lib/departments/localized-name'
import { yearLevelTitle } from '@/lib/education/year-level'
import { toast } from '@/components/ui/toast'

// ─── Рабочее пространство «Учёба» — drill-down ───────────────────────────────
//   Структура (מבנה) → Год (שנה) → Набор/еврейский год (מחזור) → Семестры
// Один список семестров (class_groups is_semester=true) группируется клиентски
// по department → year_level → year_label. «Каждый видит только своё» — список
// приходит из API, уже ограниченного правами.

interface DeptRef { id: string; name: string; name_he?: string | null; name_en?: string | null }
interface Department extends DeptRef { }

interface SemesterGroup {
  id: string
  name: string
  year_label: string | null
  term_number: number | null
  year_level: number | null
  sem_status: string | null
  tuition_amount: number | null
  study_track: { id: string; name_he: string | null; name_ru: string | null; name_en: string | null } | null
  department: DeptRef | null
  counts: { teachers: number; students: number }
}

interface SemesterGroupInitial {
  id: string; name: string; year_label: string | null; term_number: number | null; year_level: number | null
  study_track_id: string | null; department_id: string; tuition_amount: number | null
  period_start: string | null; period_end: string | null
  teachers: { person_id: string; full_name: string | null; is_primary: boolean; monthly_rate: number | null }[]
  students: { journey_id: string; full_name: string | null }[]
}

const accent = getModuleColor('education')
const NO_STRUCT = '__none__'

export default function StudiesWorkspace() {
  const t = useTranslations('education.study')
  const { lang } = useLang()

  const [groups, setGroups] = useState<SemesterGroup[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Уровень навигации.
  const [structId, setStructId] = useState<string | null>(null)     // department id (или NO_STRUCT)
  const [yearLevel, setYearLevel] = useState<number | 'none' | null>(null)
  const [cohort, setCohort] = useState<string | 'none' | null>(null) // year_label

  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingInitial, setEditingInitial] = useState<SemesterGroupInitial | null>(null)
  const [openSem, setOpenSem] = useState<{ id: string; name: string } | null>(null)  // открытый семестр → его курсы

  const loadData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [gResp, dResp] = await Promise.all([
        fetch('/api/education/semester-groups'),
        fetch('/api/settings/departments'),
      ])
      if (!gResp.ok) throw new Error(t('common.error_generic'))
      const gJson = await gResp.json()
      const dJson = dResp.ok ? await dResp.json() : []
      setGroups(gJson.semester_groups ?? [])
      setDepartments(Array.isArray(dJson) ? dJson : (dJson.departments ?? []))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error_unknown'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { loadData() }, [loadData])

  // ── Группировки ──────────────────────────────────────────────────────────
  const structLabel = useCallback((id: string): string => {
    if (id === NO_STRUCT) return t('workspace.structure_one')
    const d = departments.find(x => x.id === id)
    return d ? localizedDeptName(d, lang) : (groups.find(g => g.department?.id === id)?.department?.name ?? '—')
  }, [departments, groups, lang, t])

  const structures = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of groups) {
      const id = g.department?.id ?? NO_STRUCT
      m.set(id, (m.get(id) ?? 0) + 1)
    }
    return [...m.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => structLabel(a.id).localeCompare(structLabel(b.id)))
  }, [groups, structLabel])

  const inStruct = useMemo(() =>
    structId == null ? [] : groups.filter(g => (g.department?.id ?? NO_STRUCT) === structId),
  [groups, structId])

  const years = useMemo(() => {
    const m = new Map<number | 'none', number>()
    for (const g of inStruct) {
      const k = g.year_level ?? 'none'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()].map(([k, count]) => ({ k, count }))
      .sort((a, b) => (a.k === 'none' ? 99 : a.k) - (b.k === 'none' ? 99 : b.k))
  }, [inStruct])

  const inYear = useMemo(() =>
    yearLevel == null ? [] : inStruct.filter(g => (g.year_level ?? 'none') === yearLevel),
  [inStruct, yearLevel])

  const cohorts = useMemo(() => {
    const m = new Map<string | 'none', number>()
    for (const g of inYear) {
      const k = g.year_label ?? 'none'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()].map(([k, count]) => ({ k, count }))
      .sort((a, b) => (a.k === 'none' ? '￿' : a.k).localeCompare(b.k === 'none' ? '￿' : b.k))
  }, [inYear])

  const semesters = useMemo(() =>
    cohort == null ? [] : inYear.filter(g => (g.year_label ?? 'none') === cohort),
  [inYear, cohort])

  // ── Действия ─────────────────────────────────────────────────────────────
  const openCreate = () => { setEditingInitial(null); setModalMode('create') }

  const openEdit = async (id: string) => {
    try {
      const resp = await fetch(`/api/education/semester-groups/${id}`)
      if (!resp.ok) { const e = await resp.json().catch(() => ({})); toast(e.error ?? t('common.error_generic'), 'error'); return }
      const d = await resp.json()
      setEditingInitial({
        id: d.id, name: d.name, year_label: d.year_label ?? null, term_number: d.term_number ?? null,
        year_level: d.year_level ?? null, study_track_id: d.study_track_id ?? null, department_id: d.department_id,
        tuition_amount: d.tuition_amount ?? null, period_start: d.period_start ?? null, period_end: d.period_end ?? null,
        teachers: d.teachers ?? [], students: d.students ?? [],
      })
      setModalMode('edit')
    } catch (e) { toast(e instanceof Error ? e.message : t('common.error_generic'), 'error') }
  }

  const handleSaved = () => { setModalMode(null); setEditingInitial(null); loadData() }

  const createDefaults = {
    department_id: structId && structId !== NO_STRUCT ? structId : null,
    year_level: typeof yearLevel === 'number' ? yearLevel : null,
    year_label: typeof cohort === 'string' && cohort !== 'none' ? cohort : null,
  }

  // ── Хлебные крошки drill ──────────────────────────────────────────────────
  const crumbs: { label: string; onClick: () => void }[] = [
    { label: t('workspace.all_structures'), onClick: () => { setStructId(null); setYearLevel(null); setCohort(null) } },
  ]
  if (structId != null) crumbs.push({ label: structLabel(structId), onClick: () => { setYearLevel(null); setCohort(null); setOpenSem(null) } })
  if (yearLevel != null) crumbs.push({ label: yearLevel === 'none' ? t('workspace.no_year') : yearLevelTitle(yearLevel, lang), onClick: () => { setCohort(null); setOpenSem(null) } })
  if (cohort != null) crumbs.push({ label: cohort === 'none' ? t('workspace.no_cohort') : cohort, onClick: () => setOpenSem(null) })
  if (openSem != null) crumbs.push({ label: openSem.name, onClick: () => {} })

  return (
    <div>
      {/* Панель: крошки + «добавить семестр» */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>{lang === 'he' ? '‹' : '›'}</span>}
                <button
                  type="button"
                  onClick={c.onClick}
                  disabled={last}
                  style={{
                    background: 'none', border: 'none', fontFamily: 'inherit', cursor: last ? 'default' : 'pointer',
                    fontSize: 13.5, fontWeight: last ? 700 : 600,
                    color: last ? 'var(--text)' : 'var(--accent-strong)', padding: '2px 2px',
                  }}
                >
                  {c.label}
                </button>
              </span>
            )
          })}
        </nav>
        {openSem == null && <PageActionButton label={t('semester_groups.add_button')} onClick={openCreate} accentColor={accent} />}
      </div>

      {openSem != null ? (
        <SemesterCourses semesterId={openSem.id} semesterName={openSem.name} />
      ) : (
      <>
      {loading && <div style={pad}>{t('common.loading')}</div>}
      {error && <div style={{ padding: 12, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {!loading && !error && (
        <>
          {/* Уровень 1: структуры */}
          {structId == null && (
            structures.length === 0
              ? <div style={pad}>{t('semester_groups.empty_none')}</div>
              : <>
                  <p style={hint}>{t('workspace.structures_hint')}</p>
                  <Grid>
                    {structures.map(s => (
                      <Card key={s.id} title={structLabel(s.id)} sub={t('workspace.count_semesters').replace('{n}', String(s.count))}
                        icon={ICON_STRUCT} onClick={() => { setStructId(s.id); setYearLevel(null); setCohort(null) }} />
                    ))}
                  </Grid>
                </>
          )}

          {/* Уровень 2: годы */}
          {structId != null && yearLevel == null && (
            <Grid>
              {years.map(y => (
                <Card key={String(y.k)} title={y.k === 'none' ? t('workspace.no_year') : yearLevelTitle(y.k, lang)}
                  sub={t('workspace.count_semesters').replace('{n}', String(y.count))}
                  icon={ICON_YEAR} onClick={() => { setYearLevel(y.k); setCohort(null) }} />
              ))}
            </Grid>
          )}

          {/* Уровень 3: наборы (еврейский год) */}
          {structId != null && yearLevel != null && cohort == null && (
            <Grid>
              {cohorts.map(c => (
                <Card key={String(c.k)} title={c.k === 'none' ? t('workspace.no_cohort') : c.k}
                  sub={t('workspace.count_semesters').replace('{n}', String(c.count))}
                  icon={ICON_COHORT} onClick={() => setCohort(c.k)} />
              ))}
            </Grid>
          )}

          {/* Уровень 4: семестры */}
          {structId != null && yearLevel != null && cohort != null && (
            semesters.length === 0
              ? <div style={pad}>{t('workspace.empty')}</div>
              : <Grid>
                  {semesters.map(g => (
                    <SemesterCard key={g.id} g={g} students={t('workspace.count_students').replace('{n}', String(g.counts.students))}
                      manageLabel={t('workspace.manage')} onManage={() => openEdit(g.id)}
                      onOpen={() => setOpenSem({ id: g.id, name: g.name })} />
                  ))}
                </Grid>
          )}
        </>
      )}
      </>
      )}

      {modalMode && (
        <SemesterGroupModal
          mode={modalMode}
          initial={editingInitial}
          departments={departments}
          defaults={modalMode === 'create' ? createDefaults : undefined}
          onClose={() => { setModalMode(null); setEditingInitial(null) }}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

// ── Presentational ───────────────────────────────────────────────────────────
const pad: React.CSSProperties = { padding: 40, textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }
const hint: React.CSSProperties = { margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-faint)' }

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>{children}</div>
}

function Card({ title, sub, icon, onClick }: { title: string; sub: string; icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, textAlign: 'start', width: '100%',
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        padding: '14px 15px', cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow)',
        transition: 'border-color 0.12s, transform 0.12s',
      }}
      onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'var(--accent-strong)'; el.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'var(--border)'; el.style.transform = 'translateY(0)' }}
    >
      <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--accent-tint)', color: 'var(--accent-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg style={{ width: 20, height: 20 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={icon} /></svg>
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 650, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</span>
      </span>
    </button>
  )
}

function SemesterCard({ g, students, manageLabel, onManage, onOpen }: { g: SemesterGroup; students: string; manageLabel: string; onManage: () => void; onOpen: () => void }) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 15px', boxShadow: 'var(--shadow)', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', transition: 'border-color 0.12s, transform 0.12s' }}
      onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'var(--accent-strong)'; el.style.transform = 'translateY(-1px)' }}
      onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'var(--border)'; el.style.transform = 'translateY(0)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-tint)', color: 'var(--accent-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={ICON_SEM} /></svg>
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {[g.term_number != null ? `#${g.term_number}` : null, students].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onManage() }}
        style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        {manageLabel}
      </button>
    </div>
  )
}

// Иконки (Heroicons outline)
const ICON_STRUCT = 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21'
const ICON_YEAR = 'M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z'
const ICON_COHORT = 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5'
const ICON_SEM = 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25'
