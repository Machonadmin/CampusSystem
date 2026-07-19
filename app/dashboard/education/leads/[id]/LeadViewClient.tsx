'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import { useTranslations } from '@/lib/i18n/LanguageContext'
import ProcessInfoBlock from '@/components/workflow/ProcessInfoBlock'
import StageSignatures from '@/components/workflow/StageSignatures'
import StudyTrackPanel from '@/components/education/StudyTrackPanel'
import StudyPlanPanel from '@/components/education/StudyPlanPanel'
import StudentCalendarPanel from '@/components/education/StudentCalendarPanel'
import StudentDashboardPanel from '@/components/education/StudentDashboardPanel'
import MeetingsPanel from '@/components/education/MeetingsPanel'
import PortalCredentialsPanel from '@/components/education/PortalCredentialsPanel'
import StaffStudentMessagesPanel from '@/components/education/StaffStudentMessagesPanel'
import KodeshExceptionsPanel from '@/components/education/KodeshExceptionsPanel'
import HandoffButton from '@/components/education/HandoffButton'
import JourneyTimeline from '@/components/education/JourneyTimeline'
import PlacementsPanel from '@/components/education/PlacementsPanel'
import EvaluationsPanel from '@/components/education/EvaluationsPanel'
import JourneyDocumentsPanel from '@/components/education/JourneyDocumentsPanel'
import StudentLifecyclePanel, { type StatusHistoryEntry } from '@/components/education/StudentLifecyclePanel'
import StudentFinancePanel from '@/components/finance/StudentFinancePanel'
import StudentReportTab from '@/app/dashboard/education/components/StudentReportTab'
import StudentOverviewTab from '@/app/dashboard/education/components/StudentOverviewTab'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LeadViewData {
  journeyId: string
  personId: string
  status: string | null
  createdAt: string | null
  departmentName: string | null
  person: {
    full_name: string
    first_name: string | null
    last_name: string | null
    middle_name: string | null
    hebrew_name: string | null
    birth_date: string | null
    gender: string | null
    marital_status: string | null
    nationality: string | null
    passport_number: string | null
    email: string | null
    phones: string[]
    address: Record<string, string> | null
    photo_url: string | null
  }
  interests: { free_text: string | null; direction_name: string | null; level_name: string | null; department_name: string | null }[]
  communities: {
    name: string
    country: string | null
    city: string | null
    contact_name: string | null
    contact_role: string | null
    contact_phone: string | null
    contact_email: string | null
    notes: string | null
  }[]
  relatives: { relation_type: string; full_name: string; notes: string | null }[]
  referral_source: string | null
  comment: string | null
  /** Академические данные — только для карточки студента. */
  academic?: {
    departmentName: string | null
    specialtyName: string | null
    groupName: string | null
    yearLevel: number | null
    yearStart: number | null
    enrolledAt: string | null
  } | null
}

interface Props {
  data: LeadViewData
  showEditButton: boolean
  canManage: boolean
  canConvert: boolean
  /** Когда задано — показывается вкладка «Учебный цикл» (карточка студента). */
  studyLifecycle?: { history: StatusHistoryEntry[] } | null
  /** Когда true — показывается вкладка «Успеваемость» (посещаемость + оценки). */
  showReport?: boolean
  /** Когда true — первой показывается вкладка «Обзор 360» (сводка по всем модулям). */
  showOverview?: boolean
  /** База ссылки редактирования/списка: 'leads' (по умолчанию) или 'students'. */
  routeBase?: 'leads' | 'students'
  /**
   * Контекст модуля для переиспользования карточки вне «Образования»
   * (например, «Выпускники»). По умолчанию — education. Переопределяет
   * хлебные крошки, кнопку «назад» и цвет шапки; поведение education не меняется.
   */
  navContext?: {
    moduleLabel: string
    moduleHref: string
    colorKey: string
    /** Средняя крошка (раздел). Если не задана — не отображается. */
    sectionLabel?: string
  } | null
  /**
   * Дополнительная панель — на всю ширину под основной сеткой.
   * Используется для редактируемой панели профиля выпускника.
   */
  extraPanel?: React.ReactNode
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Инициалы: first[0] + last[0]; fallback — первые буквы full_name. */
function getInitials(p: LeadViewData['person']): string {
  const f = p.first_name?.trim()
  const l = p.last_name?.trim()
  if (f || l) return `${f?.[0] ?? ''}${l?.[0] ?? ''}`.toUpperCase() || '—'
  const words = (p.full_name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '—'
  return words.slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// ── Tabs ────────────────────────────────────────────────────────────────────

type TabKey = 'overview' | 'personal' | 'contacts' | 'family' | 'community' | 'directions' | 'documents' | 'extra' | 'study' | 'report'

// ── Small presentational pieces ────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '4px 0' }}>
      <div style={{ fontSize: 13, color: 'var(--text-faint)', minWidth: 160, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>{value || '—'}</div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LeadViewClient({ data, showEditButton, canManage, canConvert, studyLifecycle, showReport, showOverview, routeBase = 'leads', navContext, extraPanel }: Props) {
  const router = useRouter()
  const t = useTranslations('education')
  const tNav = useTranslations('navigation')
  const { person } = data
  const [tab, setTab] = useState<TabKey>(showOverview ? 'overview' : 'personal')

  // Контекст модуля: по умолчанию — «Образование» (поведение не меняется).
  const moduleLabel = navContext?.moduleLabel ?? tNav('education')
  const moduleHref = navContext?.moduleHref ?? '/dashboard/education'
  const headerColorKey = navContext?.colorKey ?? 'education'

  const TABS: { key: TabKey; labelKey: string }[] = [
    ...(showOverview ? [{ key: 'overview' as TabKey, labelKey: 'overview' }] : []),
    { key: 'personal',   labelKey: 'personal' },
    { key: 'contacts',   labelKey: 'contacts' },
    { key: 'family',     labelKey: 'family' },
    { key: 'community',  labelKey: 'community' },
    { key: 'directions', labelKey: 'directions' },
    { key: 'documents',  labelKey: 'documents' },
    { key: 'extra',      labelKey: 'extra' },
    ...(studyLifecycle ? [{ key: 'study' as TabKey, labelKey: 'study' }] : []),
    ...(showReport ? [{ key: 'report' as TabKey, labelKey: 'report' }] : []),
  ]

  const statusLabel = data.status ? t(`card.status.${data.status}`, data.status) : '—'
  const cardTypeLabel = data.status ? t(`card.card_type.${data.status}`, t('card.card_type.lead')) : t('card.card_type.lead')
  const interestTexts = data.interests
    .map(i => {
      if (i.direction_name) {
        const dir = i.level_name ? `${i.direction_name}, ${i.level_name}` : i.direction_name
        return i.department_name ? `${i.department_name} → ${dir}` : dir
      }
      return (i.free_text ?? '').trim()
    })
    .filter(Boolean)
  const sectionLabel = data.status === 'applicant' ? t('card.section.applicant')
    : (data.status && data.status !== 'lead') ? t('card.section.student')
    : t('card.section.lead')

  const addr = person.address ?? {}

  function renderTab() {
    switch (tab) {
      case 'personal':
        return (
          <>
            <Field label={t('card.labels.last_name')} value={person.last_name} />
            <Field label={t('card.labels.first_name')} value={person.first_name} />
            <Field label={t('card.labels.middle_name')} value={person.middle_name} />
            <Field label={t('card.labels.hebrew_name')} value={person.hebrew_name} />
            <Field label={t('card.labels.birth_date')} value={formatDate(person.birth_date)} />
            <Field label={t('card.labels.gender')} value={person.gender ? t(`card.gender.${person.gender}`, person.gender) : '—'} />
            <Field label={t('card.labels.marital_status')} value={person.marital_status ? t(`card.marital.${person.marital_status}`, person.marital_status) : '—'} />
            <Field label={t('card.labels.citizenship')} value={person.nationality} />
            <Field label={t('card.labels.passport')} value={person.passport_number} />
          </>
        )
      case 'contacts':
        return (
          <>
            <Field label={t('card.labels.phone')} value={person.phones.length > 0 ? person.phones.join(', ') : '—'} />
            <Field label={t('card.labels.email')} value={person.email} />
            <Field label={t('card.labels.country')} value={addr.country} />
            <Field label={t('card.labels.city')} value={addr.city} />
            <Field label={t('card.labels.street')} value={addr.street} />
            <Field label={t('card.labels.house')} value={addr.house} />
            <Field label={t('card.labels.apartment')} value={addr.apartment} />
            <Field label={t('card.labels.postal_code')} value={addr.postal_code} />
          </>
        )
      case 'family':
        return data.relatives.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('card.labels.no_relatives')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.relatives.map((r, idx) => (
              <div key={idx} style={{ fontSize: 13, color: 'var(--text)' }}>
                {r.full_name || '—'} — {t(`card.relation.${r.relation_type}`, r.relation_type).toLowerCase()}
                {r.notes ? <span style={{ color: 'var(--text-faint)' }}> ({r.notes})</span> : null}
              </div>
            ))}
          </div>
        )
      case 'community':
        return data.communities.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('card.labels.no_communities')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.communities.map((c, idx) => (
              <div key={idx} style={{ fontSize: 13, color: 'var(--text)' }}>
                <div style={{ fontWeight: 500 }}>
                  {c.name || '—'}
                  {(c.city || c.country) ? <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> · {[c.country, c.city].filter(Boolean).join(', ')}</span> : null}
                </div>
                {(c.contact_name || c.contact_role || c.contact_phone || c.contact_email) && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {[c.contact_name, c.contact_role, c.contact_phone, c.contact_email].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      case 'directions':
        return interestTexts.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{t('card.labels.no_directions')}</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {interestTexts.map((text, idx) => (
              <span key={idx} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, background: 'var(--accent-tint)', color: '#3730A3' }}>
                {text}
              </span>
            ))}
          </div>
        )
      case 'documents':
        return (
          <JourneyDocumentsPanel journeyId={data.journeyId} canManage={canManage} />
        )
      case 'extra':
        return (
          <>
            <Field label={t('card.labels.referral_source')} value={data.referral_source ? t(`card.source.${data.referral_source}`, data.referral_source) : '—'} />
            <Field label={t('card.labels.comment')} value={data.comment} />
          </>
        )
      case 'study':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Академические данные */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                {t('card.lifecycle.academic_title')}
              </div>
              <Field label={t('card.labels.department')} value={data.academic?.departmentName} />
              <Field label={t('card.labels.specialty')} value={data.academic?.specialtyName} />
              <Field label={t('card.labels.group')} value={data.academic?.groupName} />
              <Field label={t('card.labels.year_level')} value={data.academic?.yearLevel ?? '—'} />
              <Field label={t('card.labels.year_start')} value={data.academic?.yearStart ?? '—'} />
              <Field label={t('card.labels.enrolled_at')} value={formatDate(data.academic?.enrolledAt ?? null)} />
            </div>
            {/* Учебный цикл */}
            {studyLifecycle && (
              <StudentLifecyclePanel
                journeyId={data.journeyId}
                currentStatus={data.status}
                canManage={canManage}
                history={studyLifecycle.history}
              />
            )}
          </div>
        )
      case 'overview':
        return <StudentOverviewTab journeyId={data.journeyId} />
      case 'report':
        return <StudentReportTab journeyId={data.journeyId} />
      default:
        return null
    }
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: tNav('home'), href: '/dashboard' },
        { label: moduleLabel, href: moduleHref },
        ...(() => {
          const crumb = navContext ? navContext.sectionLabel : sectionLabel
          return crumb ? [{ label: crumb, href: moduleHref }] : []
        })(),
        { label: person.full_name || cardTypeLabel },
      ]} />

      {/* Header with avatar */}
      <div style={{
        background: getModuleHeaderGradient(headerColorKey),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(16,185,129,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Avatar */}
            <div style={{
              width: 80, height: 80, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
              background: '#DBEAFE', color: '#1E40AF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, fontWeight: 700, border: '2px solid rgba(255,255,255,0.5)',
            }}>
              {person.photo_url
                ? <img src={person.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : getInitials(person)}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{person.full_name || cardTypeLabel}</h1>
                <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.22)', fontWeight: 500 }}>
                  {statusLabel}
                </span>
              </div>
              <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
                {cardTypeLabel} · {t('card.labels.created')}: {formatDate(data.createdAt)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {showEditButton && (
              <button
                onClick={() => router.push(`/dashboard/education/${routeBase}/${data.journeyId}/edit`)}
                style={{
                  padding: '8px 14px', fontSize: 13, fontWeight: 500,
                  background: 'var(--surface)', color: '#065F46',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                }}
              >
                {t('card.labels.edit')}
              </button>
            )}
            <button
              onClick={() => router.push(moduleHref)}
              style={{
                padding: '8px 14px', fontSize: 13, fontWeight: 500,
                background: 'rgba(255,255,255,0.2)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer',
              }}
            >
              {t('card.labels.back_to_list')}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {TABS.map(tabItem => {
          const active = tab === tabItem.key
          return (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              style={{
                padding: '8px 14px', fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--accent)' : 'var(--text-faint)',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
            >
              {t(`card.tabs.${tabItem.labelKey}`)}
            </button>
          )
        })}
      </div>

      {/* Body: tab content (left) + processes (right), 1:1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <div>
          <Section title={t(`card.tabs.${TABS.find(x => x.key === tab)?.labelKey ?? 'personal'}`)}>
            {renderTab()}
          </Section>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          {data.status === 'lead' && canConvert && <HandoffButton journeyId={data.journeyId} />}
          <ProcessInfoBlock journeyId={data.journeyId} canManage={canManage} canConvert={canConvert} />
          <StageSignatures journeyId={data.journeyId} />
          {data.status === 'student' && (
            <a href={`/dashboard/education/student-view/${data.journeyId}?name=${encodeURIComponent(person.full_name || '')}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--violet)', background: 'var(--violet-tint)', border: '1px solid var(--violet)', borderRadius: 10, padding: '9px 14px', textDecoration: 'none' }}>
              👁 {t('card.preview_as_student', 'Просмотр глазами студентки')}
            </a>
          )}
          {data.status === 'student' && canManage && <PortalCredentialsPanel journeyId={data.journeyId} />}
          {data.status === 'student' && canManage && <StaffStudentMessagesPanel journeyId={data.journeyId} canManage={canManage} />}
          {data.status === 'student' && <KodeshExceptionsPanel journeyId={data.journeyId} />}
          {data.status === 'student' && <StudentDashboardPanel journeyId={data.journeyId} />}
          {data.status === 'student' && <StudentFinancePanel journeyId={data.journeyId} />}
          {data.status === 'student' && <StudentCalendarPanel journeyId={data.journeyId} />}
          {data.status === 'student' && <MeetingsPanel journeyId={data.journeyId} canEdit={canManage} />}
          {data.status === 'student' && <StudyTrackPanel journeyId={data.journeyId} canEdit={canManage} />}
          {data.status === 'student' && <StudyPlanPanel journeyId={data.journeyId} canEdit={canManage} />}
          {data.status === 'student' && <PlacementsPanel journeyId={data.journeyId} />}
          {data.status === 'student' && <EvaluationsPanel journeyId={data.journeyId} />}
          <JourneyTimeline journeyId={data.journeyId} />
        </div>
      </div>

      {/* Дополнительная панель на всю ширину (профиль выпускника) */}
      {extraPanel}
    </div>
  )
}
