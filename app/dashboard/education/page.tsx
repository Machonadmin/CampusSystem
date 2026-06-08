'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleColor, getModuleHeaderGradient } from '@/lib/module-colors'
import StudyTab from './components/StudyTab'
import ModuleTabs from '@/components/ui/ModuleTabs'
import PageActionButton from '@/components/ui/PageActionButton'
import EducationJourneyForm from '@/components/education/EducationJourneyForm'

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
  interests: { free_text: string | null; direction_name: string | null; level_name: string | null; department_name: string | null }[]
}

type LeadSortKey = 'full_name' | 'phones' | 'email' | 'updated_at'

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
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  website: 'Сайт', social: 'Соцсети', referral: 'Рекомендация',
  call: 'Звонок', exhibition: 'Выставка', other: 'Другое',
}

const TABS = [
  { key: 'recruitment', label: 'Набор' },
  { key: 'admission',   label: 'Приём' },
  { key: 'study',       label: 'Учёба' },
] as const
type TabKey = typeof TABS[number]['key']

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase()
}
function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
/** Json-поле phones → плоский массив строк. */
function flattenPhones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(p => (typeof p === 'string' ? p : (p as { number?: string })?.number ?? ''))
    .filter(Boolean)
}
/** Текст направления: «Учреждение → Направление, Курс» или free_text. */
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
  const [tab, setTab] = useState<TabKey>('recruitment')

  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [sortBy, setSortBy] = useState<LeadSortKey>('updated_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const [applicants, setApplicants] = useState<ApplicantJourney[]>([])
  const [loadingApplicants, setLoadingApplicants] = useState(false)

  const loadLeads = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/education/leads')
    if (res.ok) setLeads(await res.json())
    setLoading(false)
  }, [])

  const loadApplicants = useCallback(async () => {
    setLoadingApplicants(true)
    const res = await fetch('/api/education/journeys?status=applicant')
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
      else if (sortBy === 'email') { va = a.email; vb = b.email }
      else if (sortBy === 'phones') { va = a.phones[0] ?? null; vb = b.phones[0] ?? null }
      else { va = a.updated_at ?? a.application_date; vb = b.updated_at ?? b.application_date }
      if (!va && !vb) return 0
      if (!va) return 1
      if (!vb) return -1
      const cmp = va.localeCompare(vb)
      return sortOrder === 'asc' ? cmp : -cmp
    })

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: 'Главная', href: '/dashboard' },
        { label: 'Образование' },
      ]} />

      <div style={{
        background: getModuleHeaderGradient('education'),
        borderRadius: 12, padding: '12px 24px',
        boxShadow: '0 2px 8px rgba(16,185,129,0.2)',
      }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Образование</h1>
      </div>

      {/* Tabs */}
      <ModuleTabs
        tabs={TABS.map(t => ({ key: t.key, label: t.label }))}
        active={tab}
        onChange={k => setTab(k as TabKey)}
        accentColor={getModuleColor('education')}
      />

      {/* ── Набор tab ─────────────────────────────────────────────────────── */}
      {tab === 'recruitment' && (
        <>
          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по имени, телефону, email, направлению..."
              style={{ flex: '1 1 220px', padding: '8px 12px', fontSize: 13, border: '1px solid #D1D5DB', borderRadius: 8, outline: 'none' }}
            />
            <PageActionButton
              label="Добавить лида"
              onClick={() => setAddOpen(true)}
              accentColor={getModuleColor('education')}
            />
          </div>

          {/* Table card */}
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflowX: 'auto' }}>
            {loading ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>Загрузка...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
                {leads.length === 0 ? 'Лиды не добавлены' : 'Ничего не найдено'}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                    {([
                      { label: 'ИМЯ',       key: 'full_name'  as LeadSortKey },
                      { label: 'ТЕЛЕФОН',    key: 'phones'     as LeadSortKey },
                      { label: 'EMAIL',      key: 'email'      as LeadSortKey },
                      { label: 'НАПРАВЛЕНИЯ', key: null },
                      { label: 'ИСТОЧНИК',   key: null },
                      { label: 'ДАТА',       key: 'updated_at' as LeadSortKey },
                      { label: 'СТАТУС',     key: null },
                    ] as { label: string; key: LeadSortKey | null }[]).map(({ label, key }) => (
                      <th
                        key={label}
                        onClick={key ? () => handleLeadSort(key) : undefined}
                        style={{
                          padding: '10px 14px', fontSize: 11, fontWeight: 600,
                          color: key ? (sortBy === key ? '#374151' : '#9CA3AF') : '#9CA3AF',
                          textAlign: 'left', whiteSpace: 'nowrap',
                          cursor: key ? 'pointer' : 'default',
                          userSelect: 'none',
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
                    <tr key={lead.profile_id} style={{ borderBottom: '1px solid #F9FAFB' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#FAFAFA' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}>

                      {/* Фото + Имя */}
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {lead.photo_url ? (
                            <img src={lead.photo_url} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#E6F1FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#2563EB', flexShrink: 0 }}>
                              {initials(lead.full_name)}
                            </div>
                          )}
                          <span
                            onClick={() => router.push(`/dashboard/education/leads/${lead.profile_id}`)}
                            style={{ fontSize: 13, fontWeight: 500, color: '#2563EB', cursor: 'pointer' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'underline' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'none' }}
                          >
                            {lead.full_name}
                          </span>
                        </div>
                      </td>

                      {/* Телефон */}
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>
                        {lead.phones[0] ?? '—'}
                      </td>

                      {/* Email */}
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151' }}>
                        {lead.email ?? '—'}
                      </td>

                      {/* Направления */}
                      <td style={{ padding: '11px 14px' }}>
                        {(() => {
                          const texts = lead.interests.map(interestLabel).filter(Boolean)
                          return texts.length === 0 ? (
                            <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {texts.map((text, idx) => (
                                <span key={idx} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#EEF2FF', color: '#3730A3', whiteSpace: 'nowrap' }}>
                                  {text}
                                </span>
                              ))}
                            </div>
                          )
                        })()}
                      </td>

                      {/* Источник */}
                      <td style={{ padding: '11px 14px', fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>
                        {lead.referral_source ? (SOURCE_LABELS[lead.referral_source] ?? lead.referral_source) : '—'}
                      </td>

                      {/* Дата */}
                      <td style={{ padding: '11px 14px', fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>
                        {formatDate(lead.application_date)}
                      </td>

                      {/* Статус */}
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#ECFDF5', color: '#065F46', fontWeight: 500 }}>
                          Потенциальный
                        </span>
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
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflowX: 'auto' }}>
          {loadingApplicants ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>Загрузка...</div>
          ) : applicants.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
              Нет абитуриентов
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                  {['ИМЯ', 'ДАТА ЗАЯВКИ', 'ТЕЛЕФОН', 'EMAIL', 'УЧРЕЖДЕНИЕ', 'НАПРАВЛЕНИЕ', 'СТАТУС'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#9CA3AF', textAlign: 'left', whiteSpace: 'nowrap' }}>
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
                    <tr key={app.id} style={{ borderBottom: '1px solid #F9FAFB' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#FAFAFA' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}>

                      {/* Фото + Имя */}
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#6D28D9', flexShrink: 0 }}>
                            {initials(fullName)}
                          </div>
                          <span
                            onClick={() => router.push(`/dashboard/education/leads/${app.id}`)}
                            style={{ fontSize: 13, fontWeight: 500, color: '#2563EB', cursor: 'pointer' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'underline' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'none' }}
                          >
                            {fullName}
                          </span>
                        </div>
                      </td>

                      {/* Дата заявки */}
                      <td style={{ padding: '11px 14px', fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>
                        {formatDate(app.application_date)}
                      </td>

                      {/* Телефон */}
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>
                        {phones[0] ?? '—'}
                      </td>

                      {/* Email */}
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151' }}>
                        {app.person?.email ?? '—'}
                      </td>

                      {/* Учреждение */}
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151' }}>
                        {app.primary_department?.name ?? '—'}
                      </td>

                      {/* Направление */}
                      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151' }}>
                        {direction}
                      </td>

                      {/* Статус */}
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#EDE9FE', color: '#6D28D9', fontWeight: 500 }}>
                          Абитуриент
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'study' && <StudyTab />}

      {addOpen && (
        <EducationJourneyForm mode="lead" onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); loadLeads() }} />
      )}
    </div>
  )
}
