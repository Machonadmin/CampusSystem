'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Breadcrumb } from '@/components/settings/Breadcrumb'
import { getModuleHeaderGradient } from '@/lib/module-colors'
import ProcessInfoBlock from '@/components/workflow/ProcessInfoBlock'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LeadViewData {
  journeyId: string
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
}

interface Props {
  data: LeadViewData
  showEditButton: boolean
  canManage: boolean
  canConvert: boolean
}

// ── Label maps ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  lead: 'Лид', applicant: 'Абитуриент', student: 'Студент',
  graduated: 'Выпускник', expelled: 'Отчислен', on_leave: 'Академ. отпуск',
}
const CARD_TYPE_LABELS: Record<string, string> = {
  lead: 'Карточка лида', applicant: 'Карточка абитуриента', student: 'Карточка студента',
  graduated: 'Карточка выпускника', expelled: 'Карточка отчисленного', on_leave: 'Карточка (академ. отпуск)',
}
const SOURCE_LABELS: Record<string, string> = {
  website: 'Сайт', social: 'Соцсети', referral: 'Рекомендация',
  call: 'Звонок', exhibition: 'Выставка', other: 'Другое',
}
const RELATION_LABELS: Record<string, string> = {
  mother: 'Мать', father: 'Отец', parent: 'Родитель', spouse: 'Супруг(а)',
  child: 'Ребёнок', sibling: 'Брат/Сестра', grandparent: 'Бабушка/Дедушка',
  guardian: 'Опекун', community_contact: 'Контакт общины',
  emergency_contact: 'Экстренный контакт', other: 'Другое',
}
const GENDER_LABELS: Record<string, string> = {
  female: 'Женский', male: 'Мужской', other: 'Другое',
}
const MARITAL_LABELS: Record<string, string> = {
  single: 'Не замужем', married: 'Замужем', divorced: 'Разведена', widowed: 'Вдова',
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

type TabKey = 'personal' | 'contacts' | 'family' | 'community' | 'directions' | 'extra'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'personal',   label: 'Личные данные' },
  { key: 'contacts',   label: 'Контакты и адрес' },
  { key: 'family',     label: 'Семья' },
  { key: 'community',  label: 'Община' },
  { key: 'directions', label: 'Направления' },
  { key: 'extra',      label: 'Дополнительно' },
]

// ── Small presentational pieces ────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '4px 0' }}>
      <div style={{ fontSize: 13, color: '#9CA3AF', minWidth: 160, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#1F2937' }}>{value || '—'}</div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LeadViewClient({ data, showEditButton, canManage, canConvert }: Props) {
  const router = useRouter()
  const { person } = data
  const [tab, setTab] = useState<TabKey>('personal')

  const statusLabel = data.status ? (STATUS_LABELS[data.status] ?? data.status) : '—'
  const cardTypeLabel = data.status ? (CARD_TYPE_LABELS[data.status] ?? 'Карточка') : 'Карточка'
  const interestTexts = data.interests
    .map(i => {
      if (i.direction_name) {
        const dir = i.level_name ? `${i.direction_name}, ${i.level_name}` : i.direction_name
        return i.department_name ? `${i.department_name} → ${dir}` : dir
      }
      return (i.free_text ?? '').trim()
    })
    .filter(Boolean)
  const sectionLabel = data.status === 'applicant' ? 'Приём'
    : (data.status && data.status !== 'lead') ? 'Учёба'
    : 'Набор'

  const addr = person.address ?? {}

  function renderTab() {
    switch (tab) {
      case 'personal':
        return (
          <>
            <Field label="Фамилия" value={person.last_name} />
            <Field label="Имя" value={person.first_name} />
            <Field label="Отчество" value={person.middle_name} />
            <Field label="Еврейское имя" value={person.hebrew_name} />
            <Field label="Дата рождения" value={formatDate(person.birth_date)} />
            <Field label="Пол" value={person.gender ? (GENDER_LABELS[person.gender] ?? person.gender) : '—'} />
            <Field label="Семейное положение" value={person.marital_status ? (MARITAL_LABELS[person.marital_status] ?? person.marital_status) : '—'} />
            <Field label="Гражданство" value={person.nationality} />
            <Field label="Паспорт" value={person.passport_number} />
          </>
        )
      case 'contacts':
        return (
          <>
            <Field label="Телефон" value={person.phones.length > 0 ? person.phones.join(', ') : '—'} />
            <Field label="Email" value={person.email} />
            <Field label="Страна" value={addr.country} />
            <Field label="Город" value={addr.city} />
            <Field label="Улица" value={addr.street} />
            <Field label="Дом" value={addr.house} />
            <Field label="Квартира" value={addr.apartment} />
            <Field label="Индекс" value={addr.postal_code} />
          </>
        )
      case 'family':
        return data.relatives.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>Родственники не указаны</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.relatives.map((r, idx) => (
              <div key={idx} style={{ fontSize: 13, color: '#1F2937' }}>
                {r.full_name || '—'} — {(RELATION_LABELS[r.relation_type] ?? r.relation_type).toLowerCase()}
                {r.notes ? <span style={{ color: '#9CA3AF' }}> ({r.notes})</span> : null}
              </div>
            ))}
          </div>
        )
      case 'community':
        return data.communities.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>Общины не указаны</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.communities.map((c, idx) => (
              <div key={idx} style={{ fontSize: 13, color: '#1F2937' }}>
                <div style={{ fontWeight: 500 }}>
                  {c.name || '—'}
                  {(c.city || c.country) ? <span style={{ color: '#9CA3AF', fontWeight: 400 }}> · {[c.country, c.city].filter(Boolean).join(', ')}</span> : null}
                </div>
                {(c.contact_name || c.contact_role || c.contact_phone || c.contact_email) && (
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                    {[c.contact_name, c.contact_role, c.contact_phone, c.contact_email].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      case 'directions':
        return interestTexts.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9CA3AF' }}>Направления не указаны</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {interestTexts.map((text, idx) => (
              <span key={idx} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, background: '#EEF2FF', color: '#3730A3' }}>
                {text}
              </span>
            ))}
          </div>
        )
      case 'extra':
        return (
          <>
            <Field label="Источник" value={data.referral_source ? (SOURCE_LABELS[data.referral_source] ?? data.referral_source) : '—'} />
            <Field label="Комментарий" value={data.comment} />
          </>
        )
      default:
        return null
    }
  }

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: 'Главная', href: '/dashboard' },
        { label: 'Образование', href: '/dashboard/education' },
        { label: sectionLabel, href: '/dashboard/education' },
        { label: person.full_name || cardTypeLabel },
      ]} />

      {/* Header with avatar */}
      <div style={{
        background: getModuleHeaderGradient('education'),
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
                {cardTypeLabel} · Создан: {formatDate(data.createdAt)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {showEditButton && (
              <button
                onClick={() => router.push(`/dashboard/education/leads/${data.journeyId}/edit`)}
                style={{
                  padding: '8px 14px', fontSize: 13, fontWeight: 500,
                  background: '#fff', color: '#065F46',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                }}
              >
                Редактировать
              </button>
            )}
            <button
              onClick={() => router.push('/dashboard/education')}
              style={{
                padding: '8px 14px', fontSize: 13, fontWeight: 500,
                background: 'rgba(255,255,255,0.2)', color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer',
              }}
            >
              ← К списку
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #E5E7EB', flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '8px 14px', fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? '#3B82F6' : '#9CA3AF',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: active ? '2px solid #3B82F6' : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#F3F4F6' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Body: tab content (left) + processes (right), 1:1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <div>
          <Section title={TABS.find(t => t.key === tab)?.label ?? ''}>
            {renderTab()}
          </Section>
        </div>
        <div>
          <ProcessInfoBlock journeyId={data.journeyId} canManage={canManage} canConvert={canConvert} />
        </div>
      </div>
    </div>
  )
}
