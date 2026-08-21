'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getModuleColor } from '@/lib/module-colors'
import PageActionButton from '@/components/ui/PageActionButton'
import EmptyState from '@/components/ui/EmptyState'
import SemesterGroupModal from './SemesterGroupModal'
import SemesterCourses from './SemesterCourses'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
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

interface TrackRef {
  id: string; name_he: string | null; name_ru: string | null; name_en: string | null
  years_count: number; sort_order: number; department_id: string | null
}

const accent = getModuleColor('education')
const NO_STRUCT = '__none__'
// Кафедра иудаики — источник уровней кодеша (независимый «маршрут»).
const KODESH_DEPT_ID = '9a3d7b3f-3f65-4653-a111-4d5296404a27'

interface KodeshLevel { id: string; name: string; name_he: string | null; name_en: string | null; count: number }

function trackLabel(tr: TrackRef, lang: string): string {
  if (lang === 'he') return tr.name_he || tr.name_ru || tr.name_en || '—'
  if (lang === 'en') return tr.name_en || tr.name_ru || tr.name_he || '—'
  return tr.name_ru || tr.name_he || tr.name_en || '—'
}

function levelLabel(l: KodeshLevel, lang: string): string {
  if (lang === 'he') return l.name_he || l.name || '—'
  if (lang === 'en') return l.name_en || l.name || '—'
  return l.name || l.name_he || '—'
}

export default function StudiesWorkspace() {
  const t = useTranslations('education.study')
  const { lang } = useLang()
  const router = useRouter()

  const [groups, setGroups] = useState<SemesterGroup[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [tracks, setTracks] = useState<TrackRef[]>([])
  const [kodeshLevels, setKodeshLevels] = useState<KodeshLevel[]>([])
  const [kodeshAvailable, setKodeshAvailable] = useState(false)
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
      const [gResp, dResp, tResp, kResp] = await Promise.all([
        fetch('/api/education/semester-groups'),
        fetch('/api/settings/departments'),
        fetch('/api/education/study-tracks'),
        // Кодеш: уровни + распределение. 403 (нет доступа к кафедре иудаики) →
        // раздел «קודש» просто не показываем (разделение прав кодеш/חול).
        fetch('/api/education/kodesh/assignment'),
      ])
      if (!gResp.ok) throw new Error(t('common.error_generic'))
      const gJson = await gResp.json()
      const dJson = dResp.ok ? await dResp.json() : []
      const tJson = tResp.ok ? await tResp.json() : { tracks: [] }
      setGroups(gJson.semester_groups ?? [])
      setDepartments(Array.isArray(dJson) ? dJson : (dJson.departments ?? []))
      setTracks(tJson.tracks ?? [])

      if (kResp.ok) {
        const kJson = await kResp.json() as {
          groups?: { id: string; name: string; name_he: string | null; name_en: string | null }[]
          students?: { kodesh_group_id: string | null }[]
        }
        const countByLevel = new Map<string, number>()
        for (const s of kJson.students ?? []) {
          if (s.kodesh_group_id) countByLevel.set(s.kodesh_group_id, (countByLevel.get(s.kodesh_group_id) ?? 0) + 1)
        }
        setKodeshLevels((kJson.groups ?? []).map(g => ({
          id: g.id, name: g.name, name_he: g.name_he, name_en: g.name_en, count: countByLevel.get(g.id) ?? 0,
        })))
        setKodeshAvailable(true)
      } else {
        setKodeshLevels([])
        setKodeshAvailable(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error_unknown'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { loadData() }, [loadData])

  // ── Группировки ──────────────────────────────────────────────────────────
  // Верхний уровень — по МАРШРУТУ (מסלול), а не по подразделению: так два
  // колледжа (על בסיס כתה ט' / י"א) — отдельные карточки, и видны все מסלולים,
  // включая пустые (תיכון, אמונה).
  const structLabel = useCallback((id: string): string => {
    if (id === NO_STRUCT) return t('workspace.no_track')
    const tr = tracks.find(x => x.id === id)
    if (tr) return trackLabel(tr, lang)
    const st = groups.find(x => x.study_track?.id === id)?.study_track
    if (!st) return '—'
    // Язык интерфейса, как в trackLabel — чтобы запасной путь не давал ивр., когда UI EN/RU.
    if (lang === 'he') return st.name_he || st.name_ru || st.name_en || '—'
    if (lang === 'en') return st.name_en || st.name_ru || st.name_he || '—'
    return st.name_ru || st.name_he || st.name_en || '—'
  }, [tracks, groups, lang, t])

  const structures = useMemo(() => {
    const countByTrack = new Map<string, number>()
    for (const g of groups) {
      const id = g.study_track?.id ?? NO_STRUCT
      countByTrack.set(id, (countByTrack.get(id) ?? 0) + 1)
    }
    // Только маршруты חול: кодеш идёт отдельным разделом (department иудаики).
    const cholTracks = tracks.filter(tr => tr.department_id !== KODESH_DEPT_ID)
    // Все активные маршруты (даже с 0 семестрами) + запасная карточка «без маршрута».
    const list = cholTracks.map(tr => ({ id: tr.id, count: countByTrack.get(tr.id) ?? 0, order: tr.sort_order }))
    if (countByTrack.has(NO_STRUCT)) list.push({ id: NO_STRUCT, count: countByTrack.get(NO_STRUCT)!, order: 9999 })
    return list.sort((a, b) => a.order - b.order || structLabel(a.id).localeCompare(structLabel(b.id)))
  }, [groups, tracks, structLabel])

  const inStruct = useMemo(() =>
    structId == null ? [] : groups.filter(g => (g.study_track?.id ?? NO_STRUCT) === structId),
  [groups, structId])

  const years = useMemo(() => {
    if (structId == null) return []
    const countByYear = new Map<number | 'none', number>()
    for (const g of inStruct) {
      const k = g.year_level ?? 'none'
      countByYear.set(k, (countByYear.get(k) ?? 0) + 1)
    }
    const yearsCount = tracks.find(x => x.id === structId)?.years_count ?? 0
    const out: { k: number | 'none'; count: number }[] = []
    // Все годы по числу лет маршрута — включая пустые (скелет структуры).
    for (let y = 1; y <= yearsCount; y++) out.push({ k: y, count: countByYear.get(y) ?? 0 })
    // Плюс годы вне диапазона / «без года», если там есть семестры (безопасность).
    for (const [k, count] of countByYear) {
      if (k === 'none') out.push({ k, count })
      else if (typeof k === 'number' && k > yearsCount) out.push({ k, count })
    }
    return out.sort((a, b) => (a.k === 'none' ? 99 : a.k) - (b.k === 'none' ? 99 : b.k))
  }, [inStruct, structId, tracks])

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

  const selectedTrack = tracks.find(x => x.id === structId)
  const createDefaults = {
    study_track_id: structId && structId !== NO_STRUCT ? structId : null,
    department_id: selectedTrack?.department_id ?? null,
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
        {/* На верхнем уровне «добавить семестр» живёт в заголовке раздела חול;
            глубже (внутри маршрута/года) — здесь, в контексте текущего drill. */}
        {openSem == null && structId != null && <PageActionButton label={t('semester_groups.add_button')} onClick={openCreate} accentColor={accent} />}
      </div>

      {openSem != null ? (
        <SemesterCourses semesterId={openSem.id} semesterName={openSem.name} />
      ) : (
      <>
      {loading && <EmptyState text={t('common.loading')} />}
      {error && <div style={{ padding: 12, background: 'var(--danger-tint)', color: 'var(--danger)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}

      {!loading && !error && (
        <>
          {/* Уровень 1: два раздела — לימודי חול (маршруты) и לימודי קודש (уровни) */}
          {structId == null && (
            <>
              {/* ─── לימודי חול ─── */}
              <SectionHeader
                label={t('workspace.section_chol')}
                actionNode={<PageActionButton label={t('semester_groups.add_button')} onClick={openCreate} accentColor={accent} style={{ padding: '7px 14px' }} />}
              />
              {structures.length === 0
                ? <EmptyState text={t('semester_groups.empty_none')} />
                : <>
                    <p style={hint}>{t('workspace.structures_hint')}</p>
                    <Grid>
                      {structures.map(s => (
                        <Card key={s.id} title={structLabel(s.id)} sub={t('workspace.count_semesters').replace('{n}', String(s.count))}
                          icon={ICON_STRUCT} onClick={() => { setStructId(s.id); setYearLevel(null); setCohort(null) }} />
                      ))}
                    </Grid>
                  </>}

              {/* ─── לימודי קודש ─── (только при наличии доступа к кафедре иудаики) */}
              {kodeshAvailable && (
                <div style={{ marginTop: 26 }}>
                  <SectionHeader
                    label={t('workspace.section_kodesh')}
                    action={{ label: t('workspace.kodesh_manage'), onClick: () => router.push('/dashboard/education/kodesh') }}
                  />
                  <p style={hint}>{t('workspace.kodesh_hint')}</p>
                  {kodeshLevels.length === 0
                    ? <EmptyState text={t('workspace.kodesh_empty')} />
                    : <Grid>
                        {kodeshLevels.map(l => (
                          <Card key={l.id} title={levelLabel(l, lang)}
                            sub={t('workspace.count_students').replace('{n}', String(l.count))}
                            icon={ICON_KODESH} onClick={() => router.push('/dashboard/education/kodesh')} />
                        ))}
                      </Grid>}
                </div>
              )}
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
            cohorts.length === 0
              ? <EmptyState text={t('workspace.empty_year')} />
              : <Grid>
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
              ? <EmptyState text={t('workspace.empty')} />
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
const hint: React.CSSProperties = { margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-faint)' }

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>{children}</div>
}

// Заголовок раздела верхнего уровня (חול / קודש) с опциональным действием справа.
// action — пилюля (навигация), actionNode — произвольный элемент (напр. «+ добавить»).
function SectionHeader({ label, action, actionNode }: { label: string; action?: { label: string; onClick: () => void }; actionNode?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px' }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{label}</h3>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      {actionNode}
      {!actionNode && action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{ padding: '6px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-strong)', background: 'var(--accent-tint)', border: '1px solid var(--accent-strong)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
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
// Кодеш — «искра/звезда» (тот же значок, что и в лаунчере שיבוץ קודש).
const ICON_KODESH = 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z'
