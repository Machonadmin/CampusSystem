'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLang, useTranslations } from '@/lib/i18n/LanguageContext'
import { getModuleColor } from '@/lib/module-colors'
import type { StudentOverview } from '@/lib/students/overview'

interface Props {
  journeyId: string
}

// ── Хелперы отображения ─────────────────────────────────────────────────────────

function formatDate(lang: string, iso: string | null): string {
  if (!iso) return '—'
  const locale = lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-US' : 'ru-RU'
  return new Date(iso + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Денежная сумма — тот же формат, что модуль «Финансы» (2 знака, без символа). */
function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Цвет для уровня риска психолог-карты. */
function riskColor(level: string | null): string {
  if (level === 'high') return '#DC2626'
  if (level === 'medium') return '#D97706'
  if (level === 'low') return '#059669'
  return '#9CA3AF'
}

/** Куда ведёт панель модуля — страница этого студента в соответствующем модуле. */
const MODULE_HREF: Record<string, string> = {
  finance: 'finance',
  dormitory: 'dormitory',
  food: 'food',
  medical: 'doctor',
  counseling: 'psychologist',
  documents: 'documents',
}

// Порядок секций в сетке (education всегда первым).
const SECTION_ORDER = ['finance', 'dormitory', 'food', 'medical', 'counseling', 'documents'] as const

// ── Компонент ─────────────────────────────────────────────────────────────────

export default function StudentOverviewTab({ journeyId }: Props) {
  const t = useTranslations('student_overview')
  const tEdu = useTranslations('education')
  const tPsy = useTranslations('psychologist')
  const { lang } = useLang()
  const router = useRouter()

  const [data, setData] = useState<StudentOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/students/${journeyId}/overview`)
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.error ?? t('load_error'))
      }
      setData(await resp.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : t('load_error'))
    } finally {
      setLoading(false)
    }
  }, [journeyId, t])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div style={{ color: '#9CA3AF', fontSize: 13, padding: '8px 0' }}>{t('loading')}</div>
  }
  if (error) {
    return <div style={{ color: '#DC2626', fontSize: 13, padding: '8px 0' }}>{error}</div>
  }
  if (!data) {
    return <div style={{ color: '#9CA3AF', fontSize: 13, padding: '8px 0' }}>{t('empty')}</div>
  }

  const { person, education, visible_sections } = data
  const open = (module: string) => router.push(`/dashboard/${module}/${journeyId}`)

  const contactBits = [person.email, ...person.phones].filter(Boolean) as string[]

  const statusLabel = education.status ? tEdu(`card.status.${education.status}`, education.status) : '—'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Контактная строка (имя/фото — в шапке карточки) */}
      {contactBits.length > 0 && (
        <div style={{ fontSize: 13, color: '#6B7280', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {contactBits.map((c, i) => (
            <span key={i}>{c}</span>
          ))}
        </div>
      )}

      {/* Сетка панелей */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, alignItems: 'start' }}>
        {/* Education — всегда */}
        <Panel accent={getModuleColor('education')} title={t('section_education')}>
          <Badge text={statusLabel} color={getModuleColor('education')} bg={getModuleColor('education', 'light')} />
          <Row label={t('label_department')} value={education.department} />
          <Row label={t('label_specialty')} value={education.specialty} />
          <Row label={t('label_opened_at')} value={formatDate(lang, education.opened_at)} />
        </Panel>

        {SECTION_ORDER.map(section => {
          const permitted = visible_sections.includes(section)
          const module = section === 'medical' ? 'doctor' : section === 'counseling' ? 'psychologist' : section
          const accent = getModuleColor(module)
          const href = MODULE_HREF[section]

          // Секция для модуля с правом, но без данных — приглушённая плитка.
          const renderBody = (): React.ReactNode | null => {
            if (section === 'finance') {
              const f = data.finance
              if (!f) return null
              return (
                <>
                  <Row label={t('label_charged')} value={formatMoney(f.charged)} />
                  <Row label={t('label_collected')} value={formatMoney(f.collected)} />
                  <Row label={t('label_outstanding')} value={formatMoney(f.outstanding)} strong />
                </>
              )
            }
            if (section === 'dormitory') {
              const d = data.dormitory
              if (!d) return null
              return (
                <>
                  <Row label={t('label_building')} value={d.building} />
                  <Row label={t('label_room')} value={d.room} />
                  <Row label={t('label_since')} value={formatDate(lang, d.since)} />
                </>
              )
            }
            if (section === 'food') {
              const fd = data.food
              if (!fd) return null
              return (
                <>
                  <Row label={t('label_plan')} value={fd.plan_name} />
                  <Row label={t('label_since')} value={formatDate(lang, fd.since)} />
                </>
              )
            }
            if (section === 'medical') {
              const m = data.medical
              if (!m) return null
              return (
                <>
                  <Row label={t('label_open_visits')} value={String(m.open_visits)} />
                  <Row label={t('label_last_visit')} value={formatDate(lang, m.last_visit_date)} />
                  <Row label={t('label_allergies')} value={m.has_allergies ? t('yes') : t('no')} />
                </>
              )
            }
            if (section === 'counseling') {
              const c = data.counseling
              if (!c) return null
              return (
                <>
                  <Row label={t('label_open_sessions')} value={String(c.open_sessions)} />
                  <Row
                    label={t('label_risk_level')}
                    value={c.risk_level ? tPsy(`risk.${c.risk_level}`, c.risk_level) : '—'}
                    valueColor={riskColor(c.risk_level)}
                  />
                </>
              )
            }
            // documents
            const dc = data.documents
            if (!dc) return null
            return (
              <>
                <Row label={t('label_doc_total')} value={String(dc.total)} />
                <Row label={t('label_doc_expiring')} value={String(dc.expiring_soon)} valueColor={dc.expiring_soon > 0 ? '#D97706' : undefined} />
                <Row label={t('label_doc_expired')} value={String(dc.expired)} strong valueColor={dc.expired > 0 ? '#DC2626' : undefined} />
              </>
            )
          }

          if (!permitted) return null
          const body = renderBody()
          const titleKey = `section_${section}`

          if (!body) {
            // Право есть, но данных нет.
            return (
              <Panel key={section} accent={accent} title={t(titleKey)} muted>
                <div style={{ fontSize: 13, color: '#9CA3AF' }}>{t('no_data')}</div>
              </Panel>
            )
          }

          return (
            <Panel key={section} accent={accent} title={t(titleKey)} onOpen={href ? () => open(href) : undefined} openLabel={t('open')}>
              {body}
            </Panel>
          )
        })}
      </div>
    </div>
  )
}

// ── Панель модуля ────────────────────────────────────────────────────────────────

function Panel({
  accent, title, children, onOpen, openLabel, muted,
}: {
  accent: string
  title: string
  children: React.ReactNode
  onOpen?: () => void
  openLabel?: string
  muted?: boolean
}) {
  const clickable = !!onOpen
  return (
    <div
      onClick={onOpen}
      style={{
        background: muted ? '#FAFAFA' : '#fff',
        border: '1px solid #E5E7EB',
        borderTop: `3px solid ${accent}`,
        borderRadius: 10,
        padding: '14px 16px',
        cursor: clickable ? 'pointer' : 'default',
        opacity: muted ? 0.85 : 1,
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {title}
        </div>
        {clickable && openLabel && (
          <span style={{ fontSize: 11, color: accent, whiteSpace: 'nowrap' }}>{openLabel} ‹</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  )
}

// ── Строка «метка → значение» ────────────────────────────────────────────────────

function Row({
  label, value, strong, valueColor,
}: { label: string; value: React.ReactNode; strong?: boolean; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
      <span style={{ color: '#9CA3AF', flexShrink: 0 }}>{label}</span>
      <span style={{ color: valueColor ?? '#1F2937', fontWeight: strong ? 700 : 500, textAlign: 'end', minWidth: 0 }}>
        {value || '—'}
      </span>
    </div>
  )
}

// ── Бейдж (статус/уровень) ────────────────────────────────────────────────────────

function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{
      alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, padding: '2px 10px',
      borderRadius: 99, color, background: bg, marginBottom: 4,
    }}>
      {text}
    </span>
  )
}
