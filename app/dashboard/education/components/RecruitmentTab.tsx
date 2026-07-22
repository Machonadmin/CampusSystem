'use client'
import { flattenPhones } from '@/lib/persons/phone'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getModuleColor } from '@/lib/module-colors'
import PageActionButton from '@/components/ui/PageActionButton'
import EducationJourneyForm from '@/components/education/EducationJourneyForm'
import { downloadCsv } from '@/lib/csv'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { DownloadIcon } from '@/components/ui/DownloadIcon'
import {
  ApplicantDetail, formatDate, initials, interestLabel,
  type Lead, type LeadSortKey, type ProcessStatusFilter,
} from './education-shared'

// ─── Вкладка «Набор» (лиды) ──────────────────────────────────────────────────
// Выделена из education/page.tsx (Workstream 3b). Владеет всем состоянием,
// относящимся к списку лидов: фильтры, сортировка, меню строки, удаление.

export default function RecruitmentTab() {
  const router = useRouter()
  const t = useTranslations('education')
  const tCommon = useTranslations('common')
  const { lang } = useLang()

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [sortBy, setSortBy] = useState<LeadSortKey>('application_date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [processStatus, setProcessStatus] = useState<ProcessStatusFilter>('active')
  const [stageFilter, setStageFilter] = useState<'all' | 'interested' | 'in_process'>('all')
  const [mineOnly, setMineOnly] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeFilters = (processStatus !== 'active' ? 1 : 0) + (stageFilter !== 'all' ? 1 : 0) + (mineOnly ? 1 : 0)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  // Меню ··· рендерим position:fixed по координатам кнопки, иначе overflow:auto
  // таблицы его обрезает / уводит за экран. Считаем позицию при открытии.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null)  // прогрессивное раскрытие строки лида

  function openRowMenu(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (openMenuId === id) { setOpenMenuId(null); return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const MENU_W = 190, MENU_H = 190
    let left = rect.right - MENU_W
    if (left < 8) left = 8
    if (left + MENU_W > window.innerWidth - 8) left = window.innerWidth - 8 - MENU_W
    const top = rect.bottom + MENU_H > window.innerHeight - 8 ? rect.top - MENU_H : rect.bottom + 4
    setMenuPos({ top: Math.max(8, top), left })
    setOpenMenuId(id)
  }

  const loadLeads = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/education/leads?process_status=${processStatus}${mineOnly ? '&mine=1' : ''}`)
    if (res.ok) setLeads(await res.json())
    setLoading(false)
  }, [processStatus, mineOnly])

  useEffect(() => { loadLeads() }, [loadLeads])

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

  async function toggleRecruitmentStage(lead: Lead) {
    const next = lead.recruitment_stage === 'interested' ? 'in_process' : 'interested'
    const res = await fetch(`/api/education/leads/${lead.profile_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recruitment_stage: next }),
    })
    if (res.ok) loadLeads()
  }

  const filtered = leads
    .filter(l => stageFilter === 'all' || l.recruitment_stage === stageFilter)
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
    downloadCsv('leads', [headers, ...rows])
  }

  return (
    <>
      {openMenuId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setOpenMenuId(null)} />
      )}

      {/* Toolbar — только поиск, «Фильтры», создать, экспорт всегда видимы */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('leads.search_placeholder')}
          style={{ flex: '1 1 220px', padding: '8px 12px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, outline: 'none' }}
        />
        <button
          type="button"
          onClick={() => setFiltersOpen(v => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 12px', fontSize: 13,
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
          <DownloadIcon /> {tCommon('export_csv')}
        </button>
      </div>

      {/* Свёрнутые фильтры */}
      {filtersOpen && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8 }}>
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
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value as 'all' | 'interested' | 'in_process')}
            style={{ padding: '8px 12px', fontSize: 13, border: '1px solid var(--border-strong)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer' }}
          >
            <option value="all">{t('recruitment_stage.filter_all')}</option>
            <option value="interested">{t('recruitment_stage.interested')}</option>
            <option value="in_process">{t('recruitment_stage.in_process')}</option>
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
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => { setProcessStatus('active'); setStageFilter('all'); setMineOnly(false) }}
              style={{ padding: '7px 10px', fontSize: 12.5, cursor: 'pointer', background: 'none', border: 'none', color: 'var(--accent-strong)', fontWeight: 600, fontFamily: 'inherit' }}
            >
              {t('students.filters_clear')}
            </button>
          )}
        </div>
      )}

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
                  { label: t('leads.table.phone'),             key: null },
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
                      width: idx === 3 ? 48 : undefined,
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
              {filtered.map(lead => {
                const open = expandedLeadId === lead.profile_id
                const depts = [...new Set(lead.interests.map(i => i.department_name).filter((d): d is string => Boolean(d)))]
                const institution = depts.length === 0 ? '—' : depts.join(', ')
                const directionTexts = lead.interests.map(i => {
                  if (i.direction_name) return i.level_name ? `${i.direction_name}, ${i.level_name}` : i.direction_name
                  return (i.free_text ?? '').trim()
                }).filter(Boolean)
                const direction = directionTexts.length === 0 ? '—' : directionTexts.join(', ')
                return (
                <Fragment key={lead.profile_id}>
                <tr
                  onClick={() => setExpandedLeadId(open ? null : lead.profile_id)}
                  style={{ borderBottom: '1px solid var(--surface-2)', cursor: 'pointer', background: open ? 'var(--surface-2)' : undefined }}
                  onMouseEnter={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                  onMouseLeave={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = '' }}>

                  {/* Фото + Имя */}
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 9, color: 'var(--text-faint)', transition: 'transform .15s', transform: `rotate(${open ? 90 : (lang === 'he' ? 180 : 0)}deg)`, flexShrink: 0 }}>▶</span>
                      {lead.photo_url ? (
                        <img src={lead.photo_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--accent-strong)', flexShrink: 0 }}>
                          {initials(lead.full_name)}
                        </div>
                      )}
                      <span
                        onClick={e => { e.stopPropagation(); router.push(`/dashboard/education/leads/${lead.profile_id}`) }}
                        style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent-strong)', cursor: 'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'underline' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'none' }}
                      >
                        {lead.full_name}
                      </span>
                      <span style={{
                        fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap',
                        background: lead.recruitment_stage === 'in_process' ? 'var(--info-tint)' : 'var(--warn-tint)',
                        color: lead.recruitment_stage === 'in_process' ? 'var(--info)' : 'var(--warn)',
                      }}>
                        {lead.recruitment_stage === 'in_process' ? t('recruitment_stage.in_process') : t('recruitment_stage.interested')}
                      </span>
                    </div>
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

                  {/* Текущий этап и задачи */}
                  <td style={{ padding: '11px 14px', minWidth: 200 }}>
                    {processStatus === 'deleted' ? (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--danger-tint)', color: 'var(--danger)', fontWeight: 500 }}>
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
                  <td onClick={e => e.stopPropagation()} style={{ padding: '11px 8px', width: 48 }}>
                    <button
                      onClick={e => openRowMenu(e, lead.profile_id)}
                      style={{
                        border: 'none', background: 'transparent', cursor: 'pointer',
                        fontSize: 18, color: 'var(--text-faint)', padding: '2px 6px', borderRadius: 6,
                        lineHeight: 1,
                      }}
                      title={t('page_actions_title')}
                    >
                      ···
                    </button>
                    {openMenuId === lead.profile_id && menuPos && (
                      <div style={{
                        position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 100,
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.18)', width: 190,
                        overflow: 'hidden',
                      }}>
                        {lead.is_deleted ? (
                          <button
                            onClick={() => { setOpenMenuId(null); handleRestore(lead) }}
                            style={{ display: 'block', width: '100%', textAlign: 'start', padding: '9px 14px', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--success)' }}
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
                            <button
                              onClick={() => { setOpenMenuId(null); toggleRecruitmentStage(lead) }}
                              style={{ display: 'block', width: '100%', textAlign: 'start', padding: '9px 14px', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text)' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                            >
                              {lead.recruitment_stage === 'interested' ? t('recruitment_stage.mark_in_process') : t('recruitment_stage.mark_interested')}
                            </button>
                            <div style={{ borderTop: '1px solid var(--surface-2)', margin: '2px 0' }} />
                            <button
                              onClick={() => { setOpenMenuId(null); setDeleteTarget(lead) }}
                              style={{ display: 'block', width: '100%', textAlign: 'start', padding: '9px 14px', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--danger)' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--danger-tint)' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                            >
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <svg style={{ width: 15, height: 15 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.02-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                                {t('leads.actions.delete')}
                              </span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                {open && (
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <td colSpan={4} style={{ padding: '2px 16px 14px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px 22px', paddingInlineStart: 16 }}>
                        <ApplicantDetail label={t('leads.table.institution')} value={institution} />
                        <ApplicantDetail label={t('leads.table.direction')} value={direction} />
                        <ApplicantDetail label={t('leads.table.email')} value={lead.email ?? '—'} />
                        <ApplicantDetail label={t('leads.table.application_date')} value={formatDate(lead.application_date)} />
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

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
    </>
  )
}
