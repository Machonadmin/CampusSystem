'use client'

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
    hebrew_name: string | null
    birth_date: string | null
    gender: string | null
    marital_status: string | null
    nationality: string | null
    passport_number: string | null
    email: string | null
    phones: string[]
    address: Record<string, string> | null
  }
  interests: { institution: string; direction: string | null }[]
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
}

// ── Label maps ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  lead: 'Лид', applicant: 'Абитуриент', student: 'Студент',
  graduated: 'Выпускник', expelled: 'Отчислен', on_leave: 'Академ. отпуск',
}
const INST_LABELS: Record<string, string> = {
  university: 'Университет', touro: 'Touro', college: 'Колледж',
  school: 'Школа', emuna: 'Эмуна', other: 'Другое',
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

function formatAddress(addr: Record<string, string> | null): string {
  if (!addr) return '—'
  const parts = [addr.country, addr.city, addr.street, addr.house && `д. ${addr.house}`, addr.apartment && `кв. ${addr.apartment}`]
    .filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : '—'
}

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

export default function LeadViewClient({ data, showEditButton }: Props) {
  const router = useRouter()
  const { person } = data

  const statusLabel = data.status ? (STATUS_LABELS[data.status] ?? data.status) : '—'

  return (
    <div className="p-6 space-y-5">
      <Breadcrumb items={[
        { label: 'Главная', href: '/dashboard' },
        { label: 'Образование', href: '/dashboard/education' },
        { label: 'Набор', href: '/dashboard/education' },
        { label: person.full_name || 'Лид' },
      ]} />

      {/* Header */}
      <div style={{
        background: getModuleHeaderGradient('education'),
        borderRadius: 12, padding: '16px 24px', color: '#fff',
        boxShadow: '0 2px 8px rgba(16,185,129,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{person.full_name || 'Лид'}</h1>
              <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.22)', fontWeight: 500 }}>
                {statusLabel}
              </span>
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>
              Создан: {formatDate(data.createdAt)}
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

      {/* Body: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Left: data sections */}
        <div className="lg:col-span-2 space-y-4">
          {/* ОСНОВНОЕ */}
          <Section title="Основное">
            <Field label="ФИО" value={person.full_name} />
            <Field label="Еврейское имя" value={person.hebrew_name} />
            <Field label="Дата рождения" value={formatDate(person.birth_date)} />
            <Field label="Пол" value={person.gender ? (GENDER_LABELS[person.gender] ?? person.gender) : '—'} />
            <Field label="Семейное положение" value={person.marital_status ? (MARITAL_LABELS[person.marital_status] ?? person.marital_status) : '—'} />
            <Field label="Гражданство" value={person.nationality} />
            <Field label="Паспорт" value={person.passport_number} />
          </Section>

          {/* КОНТАКТЫ */}
          <Section title="Контакты">
            <Field label="Телефон" value={person.phones.length > 0 ? person.phones.join(', ') : '—'} />
            <Field label="Email" value={person.email} />
            <Field label="Адрес" value={formatAddress(person.address)} />
          </Section>

          {/* СЕМЬЯ */}
          <Section title="Семья">
            {data.relatives.length === 0 ? (
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
            )}
          </Section>

          {/* ОБЩИНА */}
          <Section title="Община">
            {data.communities.length === 0 ? (
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
            )}
          </Section>

          {/* НАПРАВЛЕНИЯ */}
          <Section title="Направления">
            {data.interests.length === 0 ? (
              <div style={{ fontSize: 13, color: '#9CA3AF' }}>Направления не указаны</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {data.interests.map((i, idx) => (
                  <span key={idx} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, background: '#EEF2FF', color: '#3730A3' }}>
                    {INST_LABELS[i.institution] ?? i.institution}{i.direction ? `: ${i.direction}` : ''}
                  </span>
                ))}
              </div>
            )}
          </Section>

          {/* ДОПОЛНИТЕЛЬНО */}
          <Section title="Дополнительно">
            <Field label="Источник" value={data.referral_source ? (SOURCE_LABELS[data.referral_source] ?? data.referral_source) : '—'} />
            <Field label="Комментарий" value={data.comment} />
          </Section>
        </div>

        {/* Right: processes */}
        <div className="lg:col-span-1">
          <ProcessInfoBlock journeyId={data.journeyId} />
        </div>
      </div>
    </div>
  )
}
