'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import StudyTab from './components/StudyTab'
import AcceptanceOverviewTab from './components/AcceptanceOverviewTab'
import ModuleTabs from '@/components/ui/ModuleTabs'
import PageActionButton from '@/components/ui/PageActionButton'
import EducationJourneyForm from '@/components/education/EducationJourneyForm'
import PendingSignatures from '@/components/workflow/PendingSignatures'
import { downloadCsv } from '@/lib/export/csv'
import { useTranslations } from '@/lib/i18n/LanguageContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Lead {
  profile_id: string
  person_id: string
  full_name: string
  email: string | null
  phones: string[]
  photo_url: string | null
  referral_source: string | null
  application_date: string | null
  updated_at: string | null
  is_deleted: boolean
  interests: { free_text: string | null; direction_name: string | null; level_name: string | null; department_name: string | null }[]
  active_stages_with_tasks: { stage_name: string; tasks: string[] }[]
}

type LeadSortKey = 'full_name' | 'application_date'
type ProcessStatusFilter = 'active' | 'closed' | 'all' | 'deleted'

/** Строка из GET /api/education/journeys?status=applicant */
interface ApplicantJourney {
  id: string
  application_date: string | null
  opened_at: string | null
  person: {
    full_name: string | null
    email: string | null
    phones: unknown
  } | null
  primary_department: { name: string } | null
  desired_department: { name: string } | null
  desired_specialty: { name: string } | null
  interests?: { free_text: string | null; direction_name: string | null; level_name: string | null; department_name: string | null }[]
  active_stages_with_tasks?: { stage_name: string; tasks: string[] }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
}
function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function flattenPhones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(p => (typeof p === 'string' ? p : (p as { number?: string })?.number ?? ''))
    .filter(Boolean)
}
function interestLabel(i: { free_text: string | null; direction_name: string | null; level_name: string | null; department_name: string | null }): string {
  if (i.direction_name) {
    const dir = i.level_name ? `${i.direction_name}, ${i.level_name}` : i.direction_name
    return i.department_name ? `${i.department_name} → ${dir}` : dir
  }
  return (i.free_text ?? '').trim()
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EducationPage() {
  const router = useRouter()
  const t = useTranslations('education')
  const tNav = useTranslations('navigation')
  const tCommon = useTranslations('common')

  const [tab, setTab] = useState<'recruitment' | 'admission' | 'committee' | 'study'>('recruitment')

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [sortBy, setSortBy] = useState<LeadSortKey>('application_date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [processStatus, setProcessStatus] = useState<ProcessStatusFilter>('active')
  const [mineOnly, setMineOnly] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [applicants, setApplicants] = useState<ApplicantJourney[]>([])
  const [loadingApplicants, setLoadingApplicants] = useState(false)

  const TABS = [
    { key: 'recruitment', label: t('tabs.leads') },
    { key: 'admission',   label: t('tabs.applicants') },
    { key: 'committee',   label: t('overview.tab') },
    { key: 'study',       label: t('tabs.students') },
  ] as const

  const loadLeads = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/education/leads?process_status=${processStatus}${mineOnly ? '&mine=1' : ''}`)
    if (res.ok) setLeads(await res.json())
    setLoading(false)
  }, [processStatus, mineOnly])

  const loadApplicants = useCallback(async () => {
    setLoadingApplicants(true)
    const res = await fetch('/api/education/journeys?status=applicant&with_stages=1')
    if (res.ok) {
      const data = await res.json() as { journeys?: ApplicantJourney[] }
      setApplicants(data.journeys ?? [])
    }
    setLoadingApplicants(false)
  }, [])

  useEffect(() => {
    if (tab === 'recruitment') loadLeads()
    if (tab === 'admission') loadApplicants()
  }, [tab, loadLeads, loadApplicants])

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    const res = await fetch(`/api/education/leads/${deleteTarget.profile_id}`, { method: 'DELETE' })
    setDeleteLoading(false)
    if (res.ok) {
      setDeleteTarget(null)
      loadLeads()
    }
  }

  async function handleRestore(lead: Lead) {
    const res = await fetch(`/api/education/leads/${lead.profile_id}/restore`, { method: 'POST' })
    if (res.ok) loadLeads()
  }

  function handleLeadSort(key: LeadSortKey) {
    if (sortBy === key) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(key)
      setSortOrder('asc')
    }
  }

  const filtered = leads
    .filter(l => {
      const q = search.toLowerCase()
      return !q ||
        l.full_name.toLowerCase().includes(q) ||
        (l.email?.toLowerCase().includes(q) ?? false) ||
        l.phones.some(p => p.includes(q)) ||
        l.interests.some(i => interestLabel(i).toLowerCase().includes(q))
    })
    .sort((a, b) => {
      let va: string | null
      let vb: string | null
      if (sortBy === 'full_name') { va = a.full_name; vb = b.full_name }
      else { va = a.application_date; vb = b.application_date }
      if (!va && !vb) return 0
      if (!va) return 1
      if (!vb) return -1
      const cmp = va.localeCompare(vb)
      return sortOrder === 'asc' ? cmp : -cmp
    })

  function exportLeads() {
    const headers = [t('leads.table.full_name'), t('leads.table.institution'), t('leads.table.direction'), t('leads.table.phone'), t('leads.table.email'), t('leads.table.application_date')]
    const rows = filtered.map(l => {
      const depts = [...new Set(l.interests.map(i => i.department_name).filter(Boolean))].join('; ')
      const dirs = l.interests.map(interestLabel).filter(Boolean).join('; ')
      return [l.full_name, depts, dirs, l.phones.join(' '), l.email ?? '', formatDate(l.application_date)]
    })
    downloadCsv('leads', headers, rows)
  }

  function exportApplicants() {
    const headers = [t('applicants.table.full_name'), t('applicants.table.phone'), t('applicants.table.email'), t('applicants.table.institution'), t('applicants.table.direction'), t('applicants.table.application_date')]
    const rows = applicants.map(a => {
      const phones = flattenPhones(a.person?.phones)
      const interestTexts = (a.interests ?? []).map(interestLabel).filter(Boolean)
      const direction = interestTexts.length > 0 ? interestTexts.join('; ') : (a.desired_specialty?.name ?? a.desired_department?.name ?? '')
      return [a.person?.full_name ?? '', phones.join(' '), a.person?.email ?? '', a.primary_department?.name ?? '', direction, formatDate(a.application_date)]
    })
    downloadCsv('applicants', headers, rows)
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: tNav('education') },
      ]} />

      <div style={{
        background: getModuleHeaderGradient('education'),
        borderRadius: 12, padding: '12px 24px',
        boxShadow: '0 2px 8px rgba(16,185,129,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{tNav('education')}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="/dashboard/education/timetable"
            style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.18)', padding: '5px 12px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {t('timetable.title')}
          </a>
          <a href="/dashboard/education/my-day"
            style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.18)', padding: '5px 12px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {t('my_day.title')}
          </a>
          <a href="/dashboard/education/units"
            style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.18)', padding: '5px 12px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {t('units.title')}
          </a>
          <a href="/dashboard/education/reports"
            style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.18)', padding: '5px 12px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {t('reports.title')}
          </a>
          <a href="/dashboard/education/structure"
            style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.18)', padding: '5px 12px', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            {t('structure.title')}
          </a>
        </div>
      </div>

      {/* Личная очередь «Ожидают моей подписи» — видна только при наличии */}
      <PendingSignatures />

      {/* Tabs */}
      <ModuleTabs
        tabs={TABS.map(tb => ({ key: tb.key, label: tb.label }))}
        active={tab}
        onChange={k => setTab(k as 'recruitment' | 'admission' | 'committee' | 'study')}
        accentColor={getModuleColor('education')}
      />

      {/* ── Набор tab ─────────────────────────────────────────────────────── */}
      {tab === 'recruitment' && (
        <>
          {openMenuId && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setOpenMenuId(null)} />
          )}

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t('leads.search_placeholder')}
              style={{ flex: '1 1 220px', padding: '8px 12px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none' }}
            />
            <select
              value={processStatus}
              onChange={e => setProcessStatus(e.target.value as ProcessStatusFilter)}
              style={{ padding: '8px 12px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer' }}
            >
              <option value="active">{t('leads.process_status.active')}</option>
              <option value="closed">{t('leads.process_status.closed')}</option>
              <option value="all">{t('leads.process_status.all')}</option>
              <option value="deleted">{t('leads.process_status.deleted')}</option>
            </select>
            <button
              type="button"
              onClick={() => setMineOnly(v => !v)}
              style={{
                padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${mineOnly ? 'var(--accent-strong)' : 'var(--border-strong)'}`,
                background: mineOnly ? 'var(--accent-tint)' : 'var(--surface)',
                color: mineOnly ? 'var(--accent-strong)' : 'var(--text-muted)', whiteSpace: 'nowrap',
              }}
            >
              {mineOnly ? t('leads.my_leads') : t('leads.all_leads')}
            </button>
            <PageActionButton
              label={t('leads.create_button')}
              onClick={() => setAddOpen(true)}
              accentColor={getModuleColor('education')}
            />
            <button
              type="button"
              onClick={exportLeads}
              disabled={filtered.length === 0}
              style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: filtered.length === 0 ? 'var(--text-faint)' : 'var(--text)', cursor: filtered.length === 0 ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
            >
              ⭳ {tCommon('export_csv')}
            </button>
          </div>

          {/* Table card */}
          <div style={{ background: 'var(--surface)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflowX: 'auto' }}>
            {loading ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>
                {leads.length === 0 ? t('leads.no_data') : t('leads.no_results')}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--surface-2)' }}>
                    {([
                      { label: t('leads.table.full_name'),        key: 'full_name'        as LeadSortKey },
                      { label: t('leads.table.institution'),       key: null },
                      { label: t('leads.table.direction'),         key: null },
                      { label: t('leads.table.phone'),             key: null },
                      { label: t('leads.table.email'),             key: null },
                      { label: t('leads.table.application_date'), key: 'application_date' as LeadSortKey },
                      { label: t('leads.table.current_stage'),     key: null },
                      { label: '',                                  key: null },
                    ] as { label: string; key: LeadSortKey | null }[]).map(({ label, key }, idx) => (
                      <th
                        key={idx}
                        onClick={key ? () => handleLeadSort(key) : undefined}
                        style={{
                          padding: '10px 14px', fontSize: 11, fontWeight: 600,
                          color: key ? (sortBy === key ? 'var(--text)' : 'var(--text-faint)') : 'var(--text-faint)',
                          textAlign: 'start', whiteSpace: 'nowrap',
                          cursor: key ? 'pointer' : 'default',
                          userSelect: 'none',
                          width: idx === 7 ? 48 : undefined,
                        }}
                      >
                        {label}
                        {key && sortBy === key && (
                          <span style={{ marginLeft: 4 }}>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(lead => (
                    <tr key={lead.profile_id} style={{ borderBottom: '1px solid var(--surface-2)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}>

                      {/* Фото + Имя */}
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {lead.photo_url ? (
                            <img src={lead.photo_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--accent-strong)', flexShrink: 0 }}>
                              {initials(lead.full_name)}
                            </div>
                          )}
                          <span
                            onClick={() => router.push(`/dashboard/education/leads/${lead.profile_id}`)}
                            style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent-strong)', cursor: 'pointer' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'underline' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'none' }}
                          >
                            {lead.full_name}
                          </span>
                        </div>
                      </td>

                      {/* Учреждение */}
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text)', maxWidth: 160 }}>
                        {(() => {
                          const depts = [...new Set(lead.interests.map(i => i.department_name).filter((d): d is string => Boolean(d)))]
                          return depts.length === 0 ? (
                            <span style={{ color: 'var(--text-faint)' }}>—</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {depts.map((d, idx) => <span key={idx}>{d}</span>)}
                            </div>
                          )
                        })()}
                      </td>

                      {/* Направление */}
                      <td style={{ padding: '11px 14px', maxWidth: 200 }}>
                        {(() => {
                          const texts = lead.interests.map(i => {
                            if (i.direction_name) return i.level_name ? `${i.direction_name}, ${i.level_name}` : i.direction_name
                            return (i.free_text ?? '').trim()
                          }).filter(Boolean)
                          return texts.length === 0 ? (
                            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>—</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12, color: 'var(--text)' }}>
                              {texts.map((txt, idx) => <span key={idx}>{txt}</span>)}
                            </div>
                          )
                        })()}
                      </td>

                      {/* Телефон */}
                      <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text)' }}>
                        {lead.phones.length === 0 ? (
                          <span style={{ color: 'var(--text-faint)' }}>—</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {lead.phones.map((p, idx) => <span key={idx} style={{ whiteSpace: 'nowrap' }}>{p}</span>)}
                          </div>
                        )}
                      </td>

                      {/* Email */}
                      <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text)' }}>
                        {lead.email ?? <span style={{ color: 'var(--text-faint)' }}>—</span>}
                      </td>

                      {/* Дата */}
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(lead.application_date)}
                      </td>

                      {/* Текущий этап и задачи */}
                      <td style={{ padding: '11px 14px', minWidth: 200 }}>
                        {processStatus === 'deleted' ? (
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#FEE2E2', color: '#991B1B', fontWeight: 500 }}>
                            {t('page_status_deleted')}
                          </span>
                        ) : lead.active_stages_with_tasks.length === 0 ? (
                          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('leads.no_stages')}</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {lead.active_stages_with_tasks.map(stage => (
                              <div key={stage.stage_name}>
                                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{stage.stage_name}</div>
                                {stage.tasks.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2, marginLeft: 8 }}>
                                    {stage.tasks.map((task, idx) => (
                                      <div key={idx} style={{ fontSize: 11, color: 'var(--text-muted)' }}>• {task}</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Действия */}
                      <td style={{ padding: '11px 8px', position: 'relative', width: 48 }}>
                        <button
                          onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === lead.profile_id ? null : lead.profile_id) }}
                          style={{
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            fontSize: 18, color: 'var(--text-faint)', padding: '2px 6px', borderRadius: 6,
                            lineHeight: 1,
                          }}
                          title={t('page_actions_title')}
                        >
                          ···
                        </button>
                        {openMenuId === lead.profile_id && (
                          <div style={{
                            position: 'absolute', right: 4, top: '100%', zIndex: 100,
                            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: 170,
                            overflow: 'hidden',
                          }}>
                            {lead.is_deleted ? (
                              <button
                                onClick={() => { setOpenMenuId(null); handleRestore(lead) }}
                                style={{ display: 'block', width: '100%', textAlign: 'start', padding: '9px 14px', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer', color: '#059669' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F0FDF4' }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                              >
                                ♻ {t('leads.actions.restore')}
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => { setOpenMenuId(null); router.push(`/dashboard/education/leads/${lead.profile_id}`) }}
                                  style={{ display: 'block', width: '100%', textAlign: 'start', padding: '9px 14px', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                                >
                                  {t('leads.actions.open')}
                                </button>
                                <button
                                  onClick={() => { setOpenMenuId(null); router.push(`/dashboard/education/leads/${lead.profile_id}/edit`) }}
                                  style={{ display: 'block', width: '100%', textAlign: 'start', padding: '9px 14px', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                                >
                                  {t('leads.actions.edit')}
                                </button>
                                <div style={{ borderTop: '1px solid var(--surface-2)', margin: '2px 0' }} />
                                <button
                                  onClick={() => { setOpenMenuId(null); setDeleteTarget(lead) }}
                                  style={{ display: 'block', width: '100%', textAlign: 'start', padding: '9px 14px', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer', color: '#DC2626' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                                >
                                  🗑 {t('leads.actions.delete')}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'admission' && (
        <>
          {applicants.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <button
                type="button"
                onClick={exportApplicants}
                style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
              >
                ⭳ {tCommon('export_csv')}
              </button>
            </div>
          )}
          <div style={{ background: 'var(--surface)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflowX: 'auto' }}>
          {loadingApplicants ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>{tCommon('loading')}</div>
          ) : applicants.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>
              {t('applicants.no_data')}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--surface-2)' }}>
                  {[
                    t('applicants.table.full_name'),
                    t('applicants.table.application_date'),
                    t('applicants.table.phone'),
                    t('applicants.table.email'),
                    t('applicants.table.institution'),
                    t('applicants.table.direction'),
                    t('applicants.table.status'),
                    t('applicants.table.current_stage'),
                  ].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textAlign: 'start', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {applicants.map(app => {
                  const fullName = app.person?.full_name ?? '—'
                  const phones = flattenPhones(app.person?.phones)
                  const interestTexts = (app.interests ?? []).map(interestLabel).filter(Boolean)
                  const direction = interestTexts.length > 0
                    ? interestTexts.join(', ')
                    : (app.desired_specialty?.name ?? app.desired_department?.name ?? '—')
                  return (
                    <tr key={app.id} style={{ borderBottom: '1px solid var(--surface-2)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}>

                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#6D28D9', flexShrink: 0 }}>
                            {initials(fullName)}
                          </div>
                          <span
                            onClick={() => router.push(`/dashboard/education/leads/${app.id}`)}
                            style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent-strong)', cursor: 'pointer' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'underline' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'none' }}
                          >
                            {fullName}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {formatDate(app.application_date)}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                        {phones[0] ?? '—'}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text)' }}>
                        {app.person?.email ?? '—'}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text)' }}>
                        {app.primary_department?.name ?? '—'}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text)' }}>
                        {direction}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#EDE9FE', color: '#6D28D9', fontWeight: 500 }}>
                          {t('applicants.status_label')}
                        </span>
                      </td>
                      <td style={{ padding: '11px 14px', minWidth: 200 }}>
                        {(app.active_stages_with_tasks ?? []).length === 0 ? (
                          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('applicants.no_stages')}</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {(app.active_stages_with_tasks ?? []).map(stage => (
                              <div key={stage.stage_name}>
                                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{stage.stage_name}</div>
                                {stage.tasks.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2, marginLeft: 8 }}>
                                    {stage.tasks.map((task, idx) => (
                                      <div key={idx} style={{ fontSize: 11, color: 'var(--text-muted)' }}>• {task}</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          </div>
        </>
      )}

      {tab === 'committee' && <AcceptanceOverviewTab />}

      {tab === 'study' && <StudyTab />}

      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '28px 28px 24px', maxWidth: 400, width: '90%', boxShadow: '0 20px 48px rgba(0,0,0,0.18)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '0 0 10px' }}>
              {t('leads.delete_confirm.title')}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text)', margin: '0 0 24px', lineHeight: 1.5 }}>
              {t('card.status.lead')} <strong>{deleteTarget.full_name}</strong> {t('leads.delete_confirm.message')}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleteLoading}
                style={{ padding: '8px 18px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', color: 'var(--text)' }}
              >
                {t('leads.delete_confirm.cancel')}
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteLoading}
                style={{ padding: '8px 18px', fontSize: 13, border: 'none', borderRadius: 8, background: 'var(--danger)', color: '#fff', cursor: deleteLoading ? 'not-allowed' : 'pointer', opacity: deleteLoading ? 0.7 : 1 }}
              >
                {t('leads.delete_confirm.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <EducationJourneyForm mode="lead" onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); loadLeads() }} />
      )}
    </div>
  )
}
