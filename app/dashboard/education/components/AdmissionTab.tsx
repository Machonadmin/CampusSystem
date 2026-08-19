'use client'
import { flattenPhones } from '@/lib/persons/phone'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { downloadCsv } from '@/lib/csv'
import { useTranslations, useLang } from '@/lib/i18n/LanguageContext'
import { DownloadIcon } from '@/components/ui/DownloadIcon'
import {
  ApplicantDetail, formatDate, initials, interestLabel,
  type ApplicantJourney,
} from './education-shared'

// ─── Вкладка «Приём» (абитуриенты) ───────────────────────────────────────────
// Выделена из education/page.tsx (Workstream 3b). Владеет своим состоянием:
// список абитуриентов, загрузка, раскрытая строка.

export default function AdmissionTab() {
  const router = useRouter()
  const t = useTranslations('education')
  const tCommon = useTranslations('common')
  const { lang } = useLang()

  const [applicants, setApplicants] = useState<ApplicantJourney[]>([])
  const [loadingApplicants, setLoadingApplicants] = useState(false)
  const [expandedApplicantId, setExpandedApplicantId] = useState<string | null>(null)  // прогрессивное раскрытие строки абитуриента

  const loadApplicants = useCallback(async () => {
    setLoadingApplicants(true)
    const res = await fetch('/api/education/journeys?status=applicant&with_stages=1')
    if (res.ok) {
      const data = await res.json() as { journeys?: ApplicantJourney[] }
      setApplicants(data.journeys ?? [])
    }
    setLoadingApplicants(false)
  }, [])

  useEffect(() => { loadApplicants() }, [loadApplicants])

  function exportApplicants() {
    const headers = [t('applicants.table.full_name'), t('applicants.table.phone'), t('applicants.table.email'), t('applicants.table.institution'), t('applicants.table.direction'), t('applicants.table.application_date')]
    const rows = applicants.map(a => {
      const phones = flattenPhones(a.person?.phones)
      const interestTexts = (a.interests ?? []).map(interestLabel).filter(Boolean)
      const direction = interestTexts.length > 0 ? interestTexts.join('; ') : (a.desired_specialty?.name ?? a.desired_department?.name ?? '')
      return [a.person?.full_name ?? '', phones.join(' '), a.person?.email ?? '', a.primary_department?.name ?? '', direction, formatDate(a.application_date)]
    })
    downloadCsv('applicants', [headers, ...rows])
  }

  return (
    <>
      {applicants.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button
            type="button"
            onClick={exportApplicants}
            style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}
          >
            <DownloadIcon /> {tCommon('export_csv')}
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
                t('applicants.table.phone'),
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
              const open = expandedApplicantId === app.id
              return (
                <Fragment key={app.id}>
                  <tr
                    onClick={() => setExpandedApplicantId(open ? null : app.id)}
                    style={{ borderBottom: '1px solid var(--surface-2)', cursor: 'pointer', background: open ? 'var(--surface-2)' : undefined }}
                    onMouseEnter={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { if (!open) (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                  >
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-faint)', transition: 'transform .15s', transform: `rotate(${open ? 90 : (lang === 'he' ? 180 : 0)}deg)`, flexShrink: 0 }}>▶</span>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--violet-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--violet)', flexShrink: 0 }}>
                          {initials(fullName)}
                        </div>
                        <span
                          onClick={e => { e.stopPropagation(); router.push(`/dashboard/education/leads/${app.id}`) }}
                          style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent-strong)', cursor: 'pointer' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'underline' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'none' }}
                        >
                          {fullName}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                      {phones[0] ?? '—'}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: 'var(--violet-tint)', color: 'var(--violet)', fontWeight: 500 }}>
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
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2, marginInlineStart: 8 }}>
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
                  {open && (
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <td colSpan={4} style={{ padding: '2px 16px 14px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px 22px', paddingInlineStart: 16 }}>
                          <ApplicantDetail label={t('applicants.table.application_date')} value={formatDate(app.application_date)} />
                          <ApplicantDetail label={t('applicants.table.email')} value={app.person?.email ?? '—'} />
                          <ApplicantDetail label={t('applicants.table.institution')} value={app.primary_department?.name ?? '—'} />
                          <ApplicantDetail label={t('applicants.table.direction')} value={direction} />
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
    </>
  )
}
